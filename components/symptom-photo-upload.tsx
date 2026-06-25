"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, Camera, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Sibling of DocumentUpload. The user uploads a photo of a *visible
// finding on their body* (rash, eye redness, swelling). The vision model
// at /api/extract-symptom-photo classifies the image and returns a
// concise clinical description ("conjunctival hyperemia visible in the
// right eye") plus a bodyPart hint. We surface the description to the
// user so they can confirm/redo, and report up to the parent so it can
// be stored alongside the rest of the case.

export interface ExtractedSymptomPhoto {
  description: string
  bodyPart: string
  fileName: string
}

interface SymptomPhotoUploadProps {
  onExtracted: (item: ExtractedSymptomPhoto) => void
  disabled?: boolean
}

type ItemState = "processing" | "done" | "error"

interface UploadItem {
  id: string
  fileName: string
  state: ItemState
  description?: string
  bodyPart?: string
  error?: string
}

const ACCEPTED_TYPES = [".jpg", ".jpeg", ".png"]
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png"]
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2000
const JPEG_QUALITY = 0.85

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
      const base64 = dataUrl.split(",")[1]
      resolve({ base64, mimeType: "image/jpeg" })
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

function friendlyError(
  status: number,
  payload: { error?: string; classification?: string; reason?: string },
): string {
  if (status === 422) {
    const cls = payload.classification
    if (cls === "medical_document") {
      return "This looks like a written medical document. Use the document upload on the “Your history” step instead."
    }
    if (cls === "unreadable") {
      return "We couldn't read this image clearly. Try better lighting or a sharper photo."
    }
    if (cls === "other") {
      return "We couldn't tell what this is a photo of. Please upload a photo showing your symptom directly."
    }
    return payload.reason || "We couldn't analyze this photo."
  }
  if (status === 502) {
    return "Our image reader is temporarily unavailable. Please try again in a moment."
  }
  return payload.error || `Upload failed (${status}).`
}

export function SymptomPhotoUpload({ onExtracted, disabled }: SymptomPhotoUploadProps) {
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
        updateItem(id, { state: "error", error: "Only JPG or PNG images." })
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
        const compressed = await compressImage(file)
        const response = await fetch("/api/extract-symptom-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: [compressed], fileName: file.name }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(friendlyError(response.status, data))
        }

        const data = await response.json()
        const description = (data.description || "").trim()
        const bodyPart = (data.bodyPart || "").trim()
        if (!description) {
          throw new Error("No description was produced for this photo.")
        }

        updateItem(id, { state: "done", description, bodyPart })
        onExtracted({ description, bodyPart, fileName: file.name })
      } catch (err: any) {
        console.error("[symptom-photo-upload] Error:", err)
        updateItem(id, { state: "error", error: err.message || "Failed to analyze photo." })
      }
    },
    [onExtracted, updateItem],
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
    [processFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length) processFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [processFiles],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length) processFiles(files)
    },
    [processFiles],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "border rounded-none px-4 py-3",
                item.state === "error" ? "bg-red-50 border-red-200" : "bg-[#faf6f0] border-[#d4c5b0]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {item.state === "processing" ? (
                    <Loader2 className="h-4 w-4 text-[#8b2500] animate-spin flex-shrink-0 mt-0.5" />
                  ) : item.state === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm truncate", item.state === "error" ? "text-red-700" : "text-gray-700")}>
                      {item.state === "processing" ? (
                        <>Analyzing <span className="font-medium">{item.fileName}</span>…</>
                      ) : item.state === "error" ? (
                        <>
                          <span className="font-medium">{item.fileName}</span>: {item.error}
                        </>
                      ) : (
                        <span className="font-medium">{item.fileName}</span>
                      )}
                    </div>
                    {item.state === "done" && item.description && (
                      <div className="mt-1 text-sm text-gray-800 leading-snug">
                        {item.bodyPart && (
                          <span className="font-semibold">{item.bodyPart}: </span>
                        )}
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
                {item.state !== "processing" && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                    aria-label={`Remove ${item.fileName}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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
          "border-2 border-dashed rounded-none px-4 py-6 text-center cursor-pointer transition-all duration-200",
          disabled
            ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
            : isDragOver
              ? "border-[#8b2500] bg-[#faf6f0]"
              : "border-gray-300 hover:border-[#d4c5b0] hover:bg-[#faf6f0]",
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
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
            <Camera className="h-5 w-5 text-gray-400" />
            <Upload className="h-5 w-5 text-gray-400" />
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">Take or upload a photo</span> of a visible symptom
          </div>
          <div className="text-xs text-gray-500">
            JPG or PNG, up to 20MB. Examples: skin rash, eye redness, swelling, joint changes.
          </div>
        </div>
      </div>
    </div>
  )
}
