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
}

const ACCEPTED_TYPES = [".pdf", ".jpg", ".jpeg", ".png", ".txt"]
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
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

async function renderPdfToImages(
  file: File
): Promise<{ base64: string; mimeType: "image/jpeg" }[]> {
  // Dynamic import to keep bundle small
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const images: { base64: string; mimeType: "image/jpeg" }[] = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const scale = 1.5 // ~150 DPI
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Failed to create canvas context")

    await page.render({ canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
    const base64 = dataUrl.split(",")[1]
    images.push({ base64, mimeType: "image/jpeg" })
  }

  return images
}

async function extractViaApi(
  images: { base64: string; mimeType: "image/jpeg" | "image/png" }[],
  fileName: string
): Promise<string> {
  const response = await fetch("/api/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, fileName }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Extraction failed (${response.status})`)
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
        updateItem(id, { state: "error", error: "Unsupported file type (PDF, JPG/PNG, or text only)" })
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
        let extractedText: string

        if (file.type === "text/plain" || ext === ".txt") {
          extractedText = await file.text()
        } else if (file.type === "application/pdf" || ext === ".pdf") {
          const images = await renderPdfToImages(file)
          extractedText = await extractViaApi(images, file.name)
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
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                {item.state === "processing" ? (
                  <Loader2 className="h-4 w-4 text-[#8b2500] animate-spin flex-shrink-0" />
                ) : item.state === "error" ? (
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-[#8b2500] flex-shrink-0" />
                )}
                <span className={cn("text-sm truncate", item.state === "error" ? "text-red-700" : "text-gray-700")}>
                  {item.state === "processing" ? (
                    <>
                      Extracting text from <span className="font-medium">{item.fileName}</span>...
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
              ? "Add more documents (PDF, image, or text file)"
              : "Upload medical documents (PDF, image, or text file) — you can add multiple"}
          </span>
        </div>
      </div>
    </div>
  )
}
