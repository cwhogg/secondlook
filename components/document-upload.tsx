"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, FileText, X, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentUploadProps {
  onTextExtracted: (text: string) => void
  disabled?: boolean
}

type UploadState = "idle" | "processing" | "done" | "error"

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
  const [state, setState] = useState<UploadState>("idle")
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setState("idle")
    setFileName("")
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const processFile = useCallback(
    async (file: File) => {
      // Validate file type
      const ext = "." + file.name.split(".").pop()?.toLowerCase()
      if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME_TYPES.includes(file.type)) {
        setError(`Unsupported file type. Please upload a PDF, image (JPG/PNG), or text file.`)
        setState("error")
        return
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large (${formatFileSize(file.size)}). Maximum size is 20MB.`)
        setState("error")
        return
      }

      setFileName(file.name)
      setState("processing")
      setError("")

      try {
        let extractedText: string

        if (file.type === "text/plain" || ext === ".txt") {
          // Plain text: read directly, no API call
          extractedText = await file.text()
        } else if (file.type === "application/pdf" || ext === ".pdf") {
          // PDF: render pages to images, send to API
          const images = await renderPdfToImages(file)
          extractedText = await extractViaApi(images, file.name)
        } else {
          // Image: compress and send to API
          const compressed = await compressImage(file)
          extractedText = await extractViaApi([compressed], file.name)
        }

        if (!extractedText.trim()) {
          throw new Error("No text could be extracted from this document.")
        }

        setState("done")
        onTextExtracted(extractedText)
      } catch (err: any) {
        console.error("[document-upload] Error:", err)
        setError(err.message || "Failed to extract text from document.")
        setState("error")
      }
    },
    [onTextExtracted]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  if (state === "done") {
    return (
      <div className="flex items-center justify-between bg-[#faf6f0] border border-[#d4c5b0] rounded-none px-4 py-3">
        <div className="flex items-center space-x-2 min-w-0">
          <FileText className="h-4 w-4 text-[#8b2500] flex-shrink-0" />
          <span className="text-sm text-gray-700 truncate">
            Text extracted from <span className="font-medium">{fileName}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={resetState}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
          aria-label="Remove uploaded document"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (state === "processing") {
    return (
      <div className="flex items-center space-x-3 bg-[#faf6f0] border border-[#d4c5b0] rounded-none px-4 py-3">
        <Loader2 className="h-4 w-4 text-[#8b2500] animate-spin flex-shrink-0" />
        <span className="text-sm text-gray-700">
          Extracting text from <span className="font-medium">{fileName}</span>...
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
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
              : state === "error"
                ? "border-red-300 bg-red-50 hover:border-red-400"
                : "border-gray-300 hover:border-[#d4c5b0] hover:bg-[#faf6f0]"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <div className="flex items-center justify-center space-x-2">
          {state === "error" ? (
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          ) : (
            <Upload className="h-5 w-5 text-gray-400 flex-shrink-0" />
          )}
          <span className={cn("text-sm", state === "error" ? "text-red-600" : "text-gray-500")}>
            {state === "error"
              ? error
              : "Upload a medical document (PDF, image, or text file)"}
          </span>
        </div>
      </div>
      {state === "error" && (
        <button
          type="button"
          onClick={resetState}
          className="text-sm text-[#8b2500] hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  )
}
