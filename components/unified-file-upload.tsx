"use client"

import { useState, useRef, useCallback } from "react"
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  FlaskConical,
  ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LabResult } from "@/lib/types/index"
import type { ExtractedSymptomPhoto } from "@/components/symptom-photo-upload"

/**
 * Unified dropzone for the intake flow's consolidated step-3 ("Upload
 * any other medical documents"). Replaces the old lab-upload + photo-
 * upload split, which forced users to pre-classify their own files.
 *
 * Per file:
 *   1. Convert to base64 image(s) — PDF via pdfjs, image via canvas.
 *      Text files pass through as raw content. Long PDFs are read in
 *      sections of PDF_BATCH_SIZE pages (a few requests in flight at a
 *      time) and the results merged.
 *   2. POST first section to /api/extract-document → { classification, extractedText }.
 *   3. Route:
 *        medical_document → /api/extract-labs (structured rows) per section,
 *          plus per-section text via /api/extract-document; multi-section
 *          records emit BOTH labs and the merged document text
 *        symptom_photo    → /api/extract-symptom-photo (description + bodyPart)
 *        unreadable/other → error, don't emit
 *   4. Emit to the parent through onLabsExtracted / onPhotoExtracted /
 *      onDocumentExtracted so each output type keeps its own verification UI.
 *
 * The parent renders a card per file with a classification badge; a
 * "not right?" affordance lets users correct misroutes.
 */

const ACCEPTED_TYPES = [".pdf", ".jpg", ".jpeg", ".png", ".md", ".markdown", ".txt"]
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]
const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2000
const JPEG_QUALITY = 0.85
// Long PDFs (multi-visit exports can run hundreds of pages) are read in
// sections of PDF_BATCH_SIZE pages — one request per section, a few in
// flight at a time — and the results merged.
const MAX_PDF_PAGES = 300
const PDF_BATCH_SIZE = 10
const PDF_BATCH_CONCURRENCY = 3
// Downstream consumers cap document text (e.g. /api/care/ingest at 200k).
const MAX_TOTAL_EXTRACTED_CHARS = 200_000
// Vercel serverless functions reject request bodies over ~4.5MB with a bare
// 413 before the route runs. Each section's rendered pages ship as base64 in
// one JSON POST, so the per-request payload must stay under that limit with
// headroom.
const TOTAL_BASE64_BUDGET = 3_500_000

export type DocumentKind = "labs" | "photo" | "document" | "unreadable" | "other"

export interface ExtractedDocument {
  fileName: string
  extractedText: string
  reason?: string
}

interface UnifiedFileUploadProps {
  onLabsExtracted: (labs: LabResult[], fileName: string) => void
  onPhotoExtracted: (item: ExtractedSymptomPhoto) => void
  onDocumentExtracted: (doc: ExtractedDocument) => void
  disabled?: boolean
}

type ItemState = "processing" | "classifying" | "extracting" | "done" | "error"

interface UploadItem {
  id: string
  fileName: string
  state: ItemState
  kind?: DocumentKind
  count?: number
  bodyPart?: string
  description?: string
  error?: string
  reclassify?: DocumentKind
  images?: { base64: string; mimeType: "image/jpeg" | "image/png" }[]
  extractedText?: string
  progress?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function compressImage(
  file: File,
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("Canvas unavailable"))
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
        resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" })
      }
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

type PdfDocument = {
  numPages: number
  getPage: (n: number) => Promise<any>
}

async function openPdf(file: File): Promise<PdfDocument> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  const arrayBuffer = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise
}

async function renderPdfPageRange(
  pdf: PdfDocument,
  firstPage: number,
  lastPage: number,
): Promise<{ base64: string; mimeType: "image/jpeg" }[]> {
  const renderAll = async (maxDim: number, quality: number) => {
    const images: { base64: string; mimeType: "image/jpeg" }[] = []
    let totalBase64 = 0
    for (let i = firstPage; i <= lastPage; i++) {
      const page = await pdf.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2, maxDim / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas unavailable")
      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      const base64 = dataUrl.split(",")[1]
      totalBase64 += base64.length
      images.push({ base64, mimeType: "image/jpeg" })
    }
    return { images, totalBase64 }
  }

  // Try progressively smaller render settings until the section's payload
  // fits the request budget. Dense scanned pages at full quality routinely
  // exceed it.
  const settingsLadder = [
    { maxDim: MAX_IMAGE_DIMENSION, quality: JPEG_QUALITY },
    { maxDim: 1600, quality: 0.75 },
    { maxDim: 1200, quality: 0.65 },
    { maxDim: 1000, quality: 0.5 },
  ]
  let last: { base64: string; mimeType: "image/jpeg" }[] = []
  for (const { maxDim, quality } of settingsLadder) {
    const { images, totalBase64 } = await renderAll(maxDim, quality)
    last = images
    if (totalBase64 <= TOTAL_BASE64_BUDGET) return images
  }
  return last
}

/** Classification vocabulary returned by /api/extract-document. */
type ApiClassification = "medical_document" | "symptom_photo" | "unreadable" | "other"

async function classifyDocument(
  images: { base64: string; mimeType: "image/jpeg" | "image/png" }[],
  fileName: string,
): Promise<{ classification: ApiClassification; extractedText: string; reason?: string }> {
  const res = await fetch("/api/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, fileName }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 413) {
      // Platform-level body-size rejection — no JSON error body.
      throw new Error(
        "This document is too large to process in one upload. Try splitting it into smaller PDFs.",
      )
    }
    // The endpoint 422s any non-medical_document classification (step-2's
    // document-upload.tsx depends on that). Here a classification is a
    // routing signal, not an error — symptom photos go to the photo
    // extractor, unreadable/other get their own messages downstream.
    if (res.status === 422 && typeof data.classification === "string") {
      return {
        classification: data.classification as ApiClassification,
        extractedText: data.extractedText || "",
        reason: data.reason,
      }
    }
    throw new Error(data.error || `Document classification failed (${res.status})`)
  }
  const data = await res.json()
  return {
    classification: (data.classification as ApiClassification) || "other",
    extractedText: data.extractedText || "",
    reason: data.reason,
  }
}

async function extractLabsFromImages(
  images: { base64: string; mimeType: "image/jpeg" | "image/png" }[],
  fileName: string,
): Promise<LabResult[]> {
  const res = await fetch("/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, fileName }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.results) ? (data.results as LabResult[]) : []
}

async function extractLabsFromText(text: string, fileName: string): Promise<LabResult[]> {
  const res = await fetch("/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, fileName }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.results) ? (data.results as LabResult[]) : []
}

async function extractPhotoFromImage(
  base64: string,
  mimeType: "image/jpeg" | "image/png",
  fileName: string,
): Promise<{ description: string; bodyPart: string } | null> {
  const res = await fetch("/api/extract-symptom-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType, fileName }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return { description: data.description || "", bodyPart: data.bodyPart || "" }
}

export function UnifiedFileUpload({
  onLabsExtracted,
  onPhotoExtracted,
  onDocumentExtracted,
  disabled,
}: UnifiedFileUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const reroute = useCallback(
    async (item: UploadItem, target: DocumentKind) => {
      // User overrides the classifier — try the other extractor. We only
      // support switching between 'labs' and 'photo' here (the two paths
      // with real extraction endpoints).
      if (!item.images || item.images.length === 0) return
      try {
        if (target === "labs") {
          updateItem(item.id, { state: "extracting", kind: "labs" })
          const labs = await extractLabsFromImages(item.images, item.fileName)
          if (labs.length > 0) {
            updateItem(item.id, { state: "done", kind: "labs", count: labs.length })
            onLabsExtracted(labs, item.fileName)
          } else {
            updateItem(item.id, {
              state: "error",
              error: "We couldn't extract lab values from this file.",
            })
          }
        } else if (target === "photo") {
          updateItem(item.id, { state: "extracting", kind: "photo" })
          const photo = await extractPhotoFromImage(
            item.images[0].base64,
            item.images[0].mimeType,
            item.fileName,
          )
          if (photo && photo.description) {
            updateItem(item.id, {
              state: "done",
              kind: "photo",
              description: photo.description,
              bodyPart: photo.bodyPart,
            })
            onPhotoExtracted({
              description: photo.description,
              bodyPart: photo.bodyPart,
              fileName: item.fileName,
            })
          } else {
            updateItem(item.id, {
              state: "error",
              error: "Couldn't describe what's visible in this photo.",
            })
          }
        }
      } catch (err: any) {
        updateItem(item.id, { state: "error", error: err.message || "Reroute failed." })
      }
    },
    [onLabsExtracted, onPhotoExtracted, updateItem],
  )

  const processFile = useCallback(
    async (file: File, id: string) => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase()
      if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME_TYPES.includes(file.type)) {
        updateItem(id, {
          state: "error",
          error: "Unsupported file (PDF, JPG, PNG, MD, or TXT only)",
        })
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        updateItem(id, {
          state: "error",
          error: `File too large (${formatFileSize(file.size)}). Maximum 20MB.`,
        })
        return
      }

      try {
        const isText =
          ext === ".md" ||
          ext === ".markdown" ||
          ext === ".txt" ||
          file.type === "text/markdown" ||
          file.type === "text/x-markdown" ||
          file.type === "text/plain"

        if (isText) {
          const content = await file.text()
          if (!content.trim()) throw new Error("File is empty.")
          updateItem(id, { state: "extracting", kind: "labs", extractedText: content })
          const labs = await extractLabsFromText(content, file.name)
          if (labs.length > 0) {
            updateItem(id, { state: "done", kind: "labs", count: labs.length })
            onLabsExtracted(labs, file.name)
          } else {
            updateItem(id, { state: "done", kind: "document" })
            onDocumentExtracted({ fileName: file.name, extractedText: content })
          }
          return
        }

        const isPdf = file.type === "application/pdf" || ext === ".pdf"
        let pdf: PdfDocument | null = null
        let totalPages = 0
        let images: { base64: string; mimeType: "image/jpeg" | "image/png" }[]
        if (isPdf) {
          pdf = await openPdf(file)
          totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES)
          // First section only — classification doesn't need the whole
          // document, and the remaining sections render lazily below.
          images = await renderPdfPageRange(pdf, 1, Math.min(totalPages, PDF_BATCH_SIZE))
        } else {
          const compressed = await compressImage(file)
          images = [compressed]
        }
        updateItem(id, { state: "classifying", images })

        const cls = await classifyDocument(images, file.name)
        updateItem(id, { extractedText: cls.extractedText })

        if (cls.classification === "unreadable") {
          throw new Error(
            "We couldn't read this file clearly. Try re-uploading a higher-quality scan or photo.",
          )
        }
        if (cls.classification === "other") {
          throw new Error(
            "This doesn't look like a medical document or symptom photo.",
          )
        }

        if (cls.classification === "symptom_photo") {
          updateItem(id, { state: "extracting", kind: "photo" })
          const photo = await extractPhotoFromImage(
            images[0].base64,
            images[0].mimeType,
            file.name,
          )
          if (!photo || !photo.description) {
            throw new Error("Couldn't describe what's visible in this photo.")
          }
          updateItem(id, {
            state: "done",
            kind: "photo",
            description: photo.description,
            bodyPart: photo.bodyPart,
          })
          onPhotoExtracted({
            description: photo.description,
            bodyPart: photo.bodyPart,
            fileName: file.name,
          })
          return
        }

        // medical_document — read every section (PDF_BATCH_SIZE pages per
        // request, a few in flight at once), then merge lab rows + text.
        updateItem(id, { state: "extracting", kind: "labs" })
        const batches: Array<[number, number]> = []
        if (pdf && totalPages > PDF_BATCH_SIZE) {
          for (let p = 1; p <= totalPages; p += PDF_BATCH_SIZE) {
            batches.push([p, Math.min(p + PDF_BATCH_SIZE - 1, totalPages)])
          }
        } else {
          batches.push([1, Math.max(totalPages, 1)])
        }

        const sectionTexts: string[] = new Array(batches.length).fill("")
        const sectionLabs: LabResult[][] = batches.map(() => [])
        let failedSections = 0
        let pagesDone = 0
        let nextBatch = 0

        const runBatch = async (idx: number) => {
          const [a, b] = batches[idx]
          const imgs = idx === 0 ? images : await renderPdfPageRange(pdf!, a, b)
          const [text, labs] = await Promise.all([
            idx === 0
              ? Promise.resolve(cls.extractedText)
              : classifyDocument(imgs, `${file.name} (pages ${a}-${b})`)
                  .then((c) => (c.classification === "medical_document" ? c.extractedText : ""))
                  .catch(() => ""),
            extractLabsFromImages(imgs, file.name),
          ])
          sectionTexts[idx] = text
          sectionLabs[idx] = labs
        }
        const worker = async () => {
          while (nextBatch < batches.length) {
            const idx = nextBatch++
            try {
              await runBatch(idx)
            } catch {
              failedSections++
            }
            pagesDone += batches[idx][1] - batches[idx][0] + 1
            if (batches.length > 1) {
              updateItem(id, { progress: `${pagesDone} of ${totalPages} pages read` })
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(PDF_BATCH_CONCURRENCY, batches.length) }, worker),
        )

        const labs = sectionLabs.flat()
        let docText = sectionTexts.filter((t) => t.trim()).join("\n\n")
        if (pdf && pdf.numPages > MAX_PDF_PAGES) {
          docText += `\n\n[Note: only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were processed.]`
        }
        if (failedSections > 0) {
          docText += `\n\n[Note: ${failedSections} section(s) of up to ${PDF_BATCH_SIZE} pages could not be read.]`
        }
        if (docText.length > MAX_TOTAL_EXTRACTED_CHARS) {
          // Slice below the cap so the appended note keeps the total under
          // the server-side 200k schema limit (over it, ingest 400s).
          docText =
            docText.slice(0, MAX_TOTAL_EXTRACTED_CHARS - 1_000) +
            "\n\n[Truncated — document text exceeded the size limit.]"
        }

        if (labs.length === 0 && !docText.trim()) {
          throw new Error("We couldn't extract anything useful from this file.")
        }
        // Single-section docs keep the original either/or semantics (labs win).
        // Multi-section records usually carry both structured labs AND
        // narrative that matters — emit both.
        if (docText.trim() && (batches.length > 1 || labs.length === 0)) {
          onDocumentExtracted({ fileName: file.name, extractedText: docText })
        }
        if (labs.length > 0) {
          updateItem(id, { state: "done", kind: "labs", count: labs.length, progress: undefined })
          onLabsExtracted(labs, file.name)
        } else {
          updateItem(id, { state: "done", kind: "document", progress: undefined })
        }
      } catch (err: any) {
        console.error("[unified-file-upload] error:", err)
        updateItem(id, { state: "error", error: err.message || "Failed to process file." })
      }
    },
    [onLabsExtracted, onPhotoExtracted, onDocumentExtracted, updateItem],
  )

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files)
      for (const file of arr) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        setItems((prev) => [...prev, { id, fileName: file.name, state: "processing" }])
        void processFile(file, id)
      }
    },
    [processFile],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-colors",
          isDragOver
            ? "border-[#8b2500] bg-[#faf6f0]"
            : "border-gray-300 hover:border-gray-400 bg-white",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={disabled}
          className="hidden"
        />
        <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-900 mb-1">
          Drop files here, or click to choose
        </p>
        <p className="text-xs text-gray-500">
          PDF, JPG, or PNG · up to 50MB per file · long PDFs read in sections (up
          to {MAX_PDF_PAGES} pages)
        </p>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-3 p-3 border border-gray-200 bg-white"
            >
              <div className="flex-shrink-0 mt-0.5">
                {it.state === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : it.state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {it.fileName}
                  </span>
                  {it.kind && it.state === "done" && (
                    <KindBadge kind={it.kind} count={it.count} />
                  )}
                </div>
                {it.state === "classifying" && (
                  <div className="text-xs text-gray-500 mt-0.5">Classifying…</div>
                )}
                {it.state === "extracting" && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {it.kind === "photo"
                      ? "Extracting photo details"
                      : "Reading document — labs, medications, diagnoses, history"}
                    …{it.progress ? ` · ${it.progress}` : ""}
                  </div>
                )}
                {it.state === "processing" && (
                  <div className="text-xs text-gray-500 mt-0.5">Preparing…</div>
                )}
                {it.state === "error" && (
                  <div className="text-xs text-red-600 mt-0.5">{it.error}</div>
                )}
                {it.state === "done" && it.kind === "photo" && it.description && (
                  <div className="text-xs text-gray-600 mt-1 leading-snug">
                    {it.bodyPart && <span className="font-semibold">{it.bodyPart}: </span>}
                    {it.description}
                  </div>
                )}
                {/* "Not right?" — user override affordance. Only shown for
                    classifier-driven items (has stored images). */}
                {it.state === "done" &&
                  it.images &&
                  it.images.length > 0 &&
                  (it.kind === "labs" || it.kind === "photo") && (
                    <button
                      type="button"
                      onClick={() =>
                        reroute(it, it.kind === "labs" ? "photo" : "labs")
                      }
                      className="text-[11px] text-[#8b2500] hover:text-[#6d1d00] underline mt-1 inline-block"
                    >
                      Not a {it.kind === "labs" ? "lab report" : "photo"}?
                      Re-analyze as a {it.kind === "labs" ? "photo" : "lab report"}.
                    </button>
                  )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                aria-label={`Remove ${it.fileName}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KindBadge({ kind, count }: { kind: DocumentKind; count?: number }) {
  const label =
    kind === "labs"
      ? count
        ? `Lab report · ${count} rows`
        : "Lab report"
      : kind === "photo"
        ? "Photo finding"
        : kind === "document"
          ? "Medical document"
          : kind === "unreadable"
            ? "Unreadable"
            : "Other"
  const Icon =
    kind === "labs"
      ? FlaskConical
      : kind === "photo"
        ? ImageIcon
        : kind === "document"
          ? FileText
          : AlertCircle
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-medium tracking-wide uppercase",
        kind === "labs" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        kind === "photo" && "border-blue-200 bg-blue-50 text-blue-800",
        kind === "document" && "border-amber-200 bg-amber-50 text-amber-800",
        (kind === "unreadable" || kind === "other") &&
          "border-red-200 bg-red-50 text-red-800",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
