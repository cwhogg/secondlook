"use client"

import { useCallback, useRef, useState } from "react"
import { Upload, FileText, X, Loader2, AlertCircle } from "lucide-react"
import type { LabResult } from "@/lib/types/index"
import { cn } from "@/lib/utils"

// Patient-uploaded lab reports → structured LabResult[]. Mirrors
// components/document-upload.tsx for PDF/image pre-processing (same
// canvas-based compression + pdfjs render), but POSTs to /api/extract-labs
// which returns schema-constrained JSON instead of free-form text.

interface LabUploadProps {
  onLabsExtracted: (labs: LabResult[]) => void
  disabled?: boolean
}

type ItemState = "processing" | "done" | "error"

interface UploadItem {
  id: string
  fileName: string
  state: ItemState
  count?: number
  error?: string
}

// Accepts:
// - PDF / JPG / PNG: client preprocesses to page-images, POSTed to
//   /api/extract-labs in image mode.
// - .md / .markdown / .txt: read as raw text and POSTed to the same
//   endpoint in text mode. Useful for lab reports a patient has copy-
//   pasted out of a portal into a markdown file.
const ACCEPTED_TYPES = [".pdf", ".jpg", ".jpeg", ".png", ".md", ".markdown", ".txt"]
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
]
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_PDF_PAGES = 10
const MAX_IMAGE_DIMENSION = 2000
const JPEG_QUALITY = 0.8

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function compressImage(file: File): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      let { width, height } = img
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
      resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" })
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

async function renderPdfToImages(
  file: File,
): Promise<{ base64: string; mimeType: "image/jpeg" }[]> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const images: { base64: string; mimeType: "image/jpeg" }[] = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Failed to create canvas context")
    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
    images.push({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" })
  }
  return images
}

async function extractLabsFromImages(
  images: { base64: string; mimeType: "image/jpeg" | "image/png" }[],
  fileName: string,
): Promise<LabResult[]> {
  const response = await fetch("/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, fileName }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Lab extraction failed (${response.status})`)
  }
  const data = await response.json()
  return Array.isArray(data.results) ? (data.results as LabResult[]) : []
}

async function extractLabsFromText(text: string, fileName: string): Promise<LabResult[]> {
  const response = await fetch("/api/extract-labs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, fileName }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Lab extraction failed (${response.status})`)
  }
  const data = await response.json()
  return Array.isArray(data.results) ? (data.results as LabResult[]) : []
}

export function LabUpload({ onLabsExtracted, disabled }: LabUploadProps) {
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
        let labs: LabResult[]
        const isText =
          ext === ".md" ||
          ext === ".markdown" ||
          ext === ".txt" ||
          file.type === "text/markdown" ||
          file.type === "text/x-markdown" ||
          file.type === "text/plain"

        if (isText) {
          const content = await file.text()
          if (!content.trim()) {
            throw new Error("File is empty.")
          }
          labs = await extractLabsFromText(content, file.name)
        } else if (file.type === "application/pdf" || ext === ".pdf") {
          const images = await renderPdfToImages(file)
          labs = await extractLabsFromImages(images, file.name)
        } else {
          const compressed = await compressImage(file)
          labs = await extractLabsFromImages([compressed], file.name)
        }
        if (labs.length === 0) {
          // This endpoint extracts structured numeric lab values. If a user
          // uploads an imaging study (X-ray, CT, MRI, etc.) here it will
          // arrive with zero values — point them to the photos & imaging
          // step instead of just saying "nothing found".
          throw new Error(
            "We didn't find any lab values in this file. If you're uploading an X-ray, CT, MRI, or ultrasound, upload it on the Photos & imaging step instead.",
          )
        }
        updateItem(id, { state: "done", count: labs.length })
        onLabsExtracted(labs)
      } catch (err: any) {
        console.error("[lab-upload] error:", err)
        updateItem(id, { state: "error", error: err.message || "Failed to extract labs." })
      }
    },
    [onLabsExtracted, updateItem],
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

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      if (disabled) return
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [disabled, handleFiles],
  )

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed border-[#d4c5b0] rounded p-6 text-center cursor-pointer transition-colors",
          isDragOver && "border-[#8b2500] bg-[#faf3eb]",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <Upload className="mx-auto h-7 w-7 text-[#8b7355] mb-2" />
        <p className="text-sm text-[#5a5a5a]">
          Drop lab reports here, or click to upload
        </p>
        <p className="text-xs text-[#8b7355] mt-1">
          PDF, JPG, PNG, MD, TXT · up to 20MB · multiple files allowed · extracted values will be shown for your review before they are used
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ""
          }}
          disabled={disabled}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-2 text-sm border border-[#e8ddd0] rounded px-3 py-2 bg-white"
            >
              <FileText className="h-4 w-4 text-[#8b7355] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-[#2a2a2a]">{it.fileName}</span>
                  {it.state === "processing" && (
                    <span className="flex items-center gap-1 text-xs text-[#8b7355]">
                      <Loader2 className="h-3 w-3 animate-spin" /> extracting…
                    </span>
                  )}
                  {it.state === "done" && (
                    <span className="text-xs text-[#2d6a4f]">
                      {it.count} result{it.count === 1 ? "" : "s"} extracted
                    </span>
                  )}
                </div>
                {it.state === "error" && (
                  <div className="mt-1 flex items-start gap-1 text-xs text-[#8b2500] break-words">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{it.error}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="text-[#8b7355] hover:text-[#8b2500] mt-0.5"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
