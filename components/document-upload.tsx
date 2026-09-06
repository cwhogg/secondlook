"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, FileText, X, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentUploadProps {
  onTextExtracted: (text: string) => void
  disabled?: boolean
}

type ItemState = "processing" | "done" | "error"

interface UploadItem {
  id: string
  fileName: string
  state: ItemState
  error?: string
  progress?: string
}

const ACCEPTED_TYPES = [".pdf", ".jpg", ".jpeg", ".png", ".txt", ".md", ".markdown"]
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  // Browsers are inconsistent about MIME for .md files (sometimes
  // text/plain, sometimes octet-stream, sometimes text/markdown). The
  // extension whitelist above is the primary gate; these MIME entries
  // catch the cases where the OS reports a proper markdown type.
  "text/markdown",
  "text/x-markdown",
]
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_IMAGE_DIMENSION = 2000
const JPEG_QUALITY = 0.8
// Long PDFs (multi-visit exports run hundreds of pages) are read in
// sections of PDF_BATCH_SIZE pages — one request per section, a few in
// flight at a time — and the extracted text merged in page order.
const MAX_PDF_PAGES = 300
const PDF_BATCH_SIZE = 10
const PDF_BATCH_CONCURRENCY = 3
// Vercel serverless functions reject request bodies over ~4.5MB with a bare
// 413 before the route runs. Each section's rendered pages ship as base64 in
// one JSON POST, so the per-request payload must stay under that with headroom.
const TOTAL_BASE64_BUDGET = 3_500_000

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function compressImage(file: File): Promise<{ base64: string; mimeType: "image/jpeg" | "image/png" }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      let { width, height } = img

      // Resize if needed
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to create canvas context"))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
      const base64 = dataUrl.split(",")[1]
      resolve({ base64, mimeType: "image/jpeg" })
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

type PdfDocument = {
  numPages: number
  getPage: (n: number) => Promise<any>
}

async function openPdf(file: File): Promise<PdfDocument> {
  // Dynamic import to keep bundle small
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
      if (!ctx) throw new Error("Failed to create canvas context")
      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      const base64 = dataUrl.split(",")[1]
      totalBase64 += base64.length
      images.push({ base64, mimeType: "image/jpeg" })
    }
    return { images, totalBase64 }
  }

  // Try progressively smaller render settings until the section's payload
  // fits the request budget.
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

function friendlyDocumentError(
  status: number,
  payload: { error?: string; classification?: string; reason?: string },
): string {
  // 422 = the endpoint understood the request but the image isn't a
  // medical document. Tell the user what they uploaded and where to
  // upload it instead.
  if (status === 422) {
    const cls = payload.classification
    if (cls === "symptom_photo") {
      return "This looks like a photo of a symptom, not a written medical document. Use the “Photo of a visible symptom” section below instead."
    }
    if (cls === "unreadable") {
      return "We couldn't read this image clearly. Try a sharper photo or a different file."
    }
    if (cls === "other") {
      return "This doesn't look like a medical document. Upload a lab report, doctor's note, imaging report, or similar."
    }
    return payload.reason || "We couldn't extract text from this file."
  }
  if (status === 502) {
    return "Our document reader is temporarily unavailable. Please try again in a moment."
  }
  return payload.error || `Extraction failed (${status}).`
}

async function extractViaApi(
  images: { base64: string; mimeType: "image/jpeg" | "image/png" }[],
  fileName: string,
  opts?: { tolerate422?: boolean },
): Promise<string> {
  const response = await fetch("/api/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, fileName }),
  })

  if (!response.ok) {
    // Mid-document sections of a long record can legitimately classify as
    // "other" (blank pages, dividers) — callers reading page ranges past
    // the first section pass tolerate422 to treat that as empty text.
    if (opts?.tolerate422 && response.status === 422) return ""
    const data = await response.json().catch(() => ({}))
    throw new Error(friendlyDocumentError(response.status, data))
  }

  const data = await response.json()
  return data.extractedText
}

export function DocumentUpload({ onTextExtracted, disabled }: DocumentUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const processFile = useCallback(
    async (file: File, id: string) => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase()

      if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME_TYPES.includes(file.type)) {
        updateItem(id, {
          state: "error",
          error: "Unsupported file type (PDF, JPG/PNG, TXT, or MD only)",
        })
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        updateItem(id, {
          state: "error",
          error: `File too large (${formatFileSize(file.size)}). Maximum 50MB.`,
        })
        return
      }

      try {
        let extractedText: string

        const isTextLike =
          ext === ".txt" ||
          ext === ".md" ||
          ext === ".markdown" ||
          file.type === "text/plain" ||
          file.type === "text/markdown" ||
          file.type === "text/x-markdown"

        if (isTextLike) {
          // Read straight from the file. The downstream pipeline already
          // understands markdown formatting; no need to convert to plain.
          extractedText = await file.text()
        } else if (file.type === "application/pdf" || ext === ".pdf") {
          const pdf = await openPdf(file)
          const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES)
          const batches: Array<[number, number]> = []
          for (let p = 1; p <= totalPages; p += PDF_BATCH_SIZE) {
            batches.push([p, Math.min(p + PDF_BATCH_SIZE - 1, totalPages)])
          }

          // First section extracts strictly — a 422 here means the file
          // isn't a written medical document at all, which is a real
          // user-facing error. Later sections tolerate failures.
          const firstImages = await renderPdfPageRange(pdf, batches[0][0], batches[0][1])
          const sectionTexts: string[] = new Array(batches.length).fill("")
          sectionTexts[0] = await extractViaApi(firstImages, file.name)
          let pagesDone = batches[0][1]
          let failedSections = 0
          let nextBatch = 1
          if (batches.length > 1) {
            updateItem(id, { progress: `${pagesDone} of ${totalPages} pages read` })
          }
          const worker = async () => {
            while (nextBatch < batches.length) {
              const idx = nextBatch++
              const [a, b] = batches[idx]
              try {
                const imgs = await renderPdfPageRange(pdf, a, b)
                sectionTexts[idx] = await extractViaApi(imgs, `${file.name} (pages ${a}-${b})`, {
                  tolerate422: true,
                })
              } catch {
                failedSections++
              }
              pagesDone += b - a + 1
              updateItem(id, { progress: `${pagesDone} of ${totalPages} pages read` })
            }
          }
          await Promise.all(
            Array.from({ length: Math.min(PDF_BATCH_CONCURRENCY, batches.length - 1) }, worker),
          )

          extractedText = sectionTexts.filter((t) => t.trim()).join("\n\n")
          if (pdf.numPages > MAX_PDF_PAGES) {
            extractedText += `\n\n[Note: only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were processed.]`
          }
          if (failedSections > 0) {
            extractedText += `\n\n[Note: ${failedSections} section(s) of up to ${PDF_BATCH_SIZE} pages could not be read.]`
          }
        } else {
          const compressed = await compressImage(file)
          extractedText = await extractViaApi([compressed], file.name)
        }

        if (!extractedText.trim()) {
          throw new Error("No text could be extracted from this document.")
        }

        updateItem(id, { state: "done" })
        onTextExtracted(extractedText)
      } catch (err: any) {
        console.error("[document-upload] Error:", err)
        updateItem(id, { state: "error", error: err.message || "Failed to extract text." })
      }
    },
    [onTextExtracted, updateItem]
  )

  const processFiles = useCallback(
    async (files: File[]) => {
      const newItems: UploadItem[] = files.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        fileName: f.name,
        state: "processing" as const,
      }))
      setItems((prev) => [...prev, ...newItems])

      for (let i = 0; i < files.length; i++) {
        await processFile(files[i], newItems[i].id)
      }
    },
    [processFile]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length) processFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [processFiles]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length) processFiles(files)
    },
    [processFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const hasItems = items.length > 0

  return (
    <div className="space-y-2">
      {hasItems && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center justify-between border rounded-none px-4 py-3",
                item.state === "error"
                  ? "bg-red-50 border-red-200"
                  : "bg-[#faf6f0] border-[#d4c5b0]"
              )}
            >
              <div className="flex items-start space-x-2 min-w-0 flex-1">
                {item.state === "processing" ? (
                  <Loader2 className="h-4 w-4 text-[#8b2500] animate-spin flex-shrink-0 mt-0.5" />
                ) : item.state === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <FileText className="h-4 w-4 text-[#8b2500] flex-shrink-0 mt-0.5" />
                )}
                <span
                  className={cn(
                    "text-sm break-words min-w-0",
                    item.state === "error" ? "text-red-700" : "text-gray-700",
                  )}
                >
                  {item.state === "processing" ? (
                    <>
                      Extracting text from <span className="font-medium">{item.fileName}</span>...
                      {item.progress ? ` · ${item.progress}` : ""}
                    </>
                  ) : item.state === "error" ? (
                    <>
                      <span className="font-medium">{item.fileName}</span>: {item.error}
                    </>
                  ) : (
                    <>
                      Text extracted from <span className="font-medium">{item.fileName}</span>
                    </>
                  )}
                </span>
              </div>
              {item.state !== "processing" && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
                  aria-label={`Remove ${item.fileName}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "border-2 border-dashed rounded-none px-4 py-4 text-center cursor-pointer transition-all duration-200",
          disabled
            ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
            : isDragOver
              ? "border-[#8b2500] bg-[#faf6f0]"
              : "border-gray-300 hover:border-[#d4c5b0] hover:bg-[#faf6f0]"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <div className="flex items-center justify-center space-x-2">
          <Upload className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-500">
            {hasItems
              ? "Add more documents (PDF, image, TXT, or Markdown)"
              : "Upload medical documents (PDF, image, TXT, or Markdown) — you can add multiple"}
          </span>
        </div>
      </div>
    </div>
  )
}
