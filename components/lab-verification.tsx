"use client"

import { AlertTriangle, Trash2 } from "lucide-react"
import type { LabResult } from "@/lib/types/index"
import { cn } from "@/lib/utils"

// User-facing verification of extracted lab values. Extraction errors are
// the highest-risk failure mode for this feature — a misread decimal or
// swapped flag can flip a whole differential — so we surface every row
// with editable fields and a delete button, and require the user to
// confirm before the labs flow into the pipeline.

interface LabVerificationProps {
  labs: LabResult[]
  onChange: (next: LabResult[]) => void
  // Threshold below which we visually flag rows as low-confidence. Defaults
  // to 0.6 (anything the extractor was less than 60% sure about).
  lowConfidenceThreshold?: number
}

function recomputeNumeric(value: string): number | undefined {
  const m = value.replace(",", "").match(/-?\d+(\.\d+)?/)
  if (!m) return undefined
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : undefined
}

const FLAG_OPTIONS: Array<{ label: string; value: LabResult["flag"] }> = [
  { label: "—", value: undefined },
  { label: "In range", value: null },
  { label: "H", value: "H" },
  { label: "L", value: "L" },
  { label: "HH", value: "HH" },
  { label: "LL", value: "LL" },
  { label: "Crit", value: "CRIT" },
]

export function LabVerification({
  labs,
  onChange,
  lowConfidenceThreshold = 0.6,
}: LabVerificationProps) {
  if (labs.length === 0) return null

  const updateRow = (idx: number, patch: Partial<LabResult>) => {
    const next = labs.slice()
    const merged: LabResult = { ...next[idx], ...patch }
    // Keep numericValue in sync if value changed.
    if (patch.value !== undefined) {
      merged.numericValue = recomputeNumeric(patch.value)
    }
    next[idx] = merged
    onChange(next)
  }

  const deleteRow = (idx: number) => {
    const next = labs.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  const lowConfidenceCount = labs.filter((l) => (l.confidence ?? 1) < lowConfidenceThreshold).length

  return (
    <div className="border border-[#d4c5b0] rounded bg-white">
      <div className="px-4 py-3 border-b border-[#e8ddd0] flex items-start gap-2">
        <div className="flex-1">
          <div className="text-sm font-semibold text-[#2a2a2a]">
            Extracted lab results · {labs.length} row{labs.length === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-[#8b7355] mt-0.5">
            Please review every row before continuing. Extraction is not perfect — edit or delete anything that looks wrong. These values will be used directly by the analysis.
          </div>
        </div>
        {lowConfidenceCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-[#a64b0a] shrink-0 mt-0.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {lowConfidenceCount} low-confidence
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-[#e8ddd0] bg-[#faf7f2] text-[10px] uppercase tracking-wider text-[#8b7355]">
              <th className="text-left py-2 px-3 font-medium">Test</th>
              <th className="text-left py-2 px-3 font-medium">Value</th>
              <th className="text-left py-2 px-3 font-medium">Unit</th>
              <th className="text-left py-2 px-3 font-medium">Reference</th>
              <th className="text-left py-2 px-3 font-medium">Flag</th>
              <th className="text-left py-2 px-3 font-medium">Date</th>
              <th className="text-left py-2 px-3 font-medium">Source</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {labs.map((lab, i) => {
              const lowConf = (lab.confidence ?? 1) < lowConfidenceThreshold
              return (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-[#e8ddd0] last:border-b-0",
                    lowConf && "bg-[#fff8f0]",
                  )}
                >
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={lab.testName}
                      onChange={(e) => updateRow(i, { testName: e.target.value })}
                      className="w-full bg-transparent text-[#2a2a2a] focus:outline-none focus:bg-white border border-transparent focus:border-[#d4c5b0] rounded px-1"
                    />
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={lab.value}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                      className="w-24 bg-transparent text-[#2a2a2a] tabular-nums focus:outline-none focus:bg-white border border-transparent focus:border-[#d4c5b0] rounded px-1"
                    />
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="text"
                      value={lab.unit ?? ""}
                      onChange={(e) => updateRow(i, { unit: e.target.value || undefined })}
                      className="w-20 bg-transparent text-[#5a5a5a] focus:outline-none focus:bg-white border border-transparent focus:border-[#d4c5b0] rounded px-1"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[#8b7355]">
                    {lab.referenceRange?.raw ?? "—"}
                  </td>
                  <td className="py-1.5 px-3">
                    <select
                      value={lab.flag === undefined ? "" : lab.flag === null ? "null" : lab.flag}
                      onChange={(e) => {
                        const v = e.target.value
                        updateRow(i, {
                          flag: v === "" ? undefined : v === "null" ? null : (v as LabResult["flag"]),
                        })
                      }}
                      className="bg-transparent text-xs focus:outline-none focus:bg-white border border-transparent focus:border-[#d4c5b0] rounded px-1 py-0.5"
                    >
                      {FLAG_OPTIONS.map((opt) => (
                        <option
                          key={opt.label}
                          value={opt.value === undefined ? "" : opt.value === null ? "null" : opt.value}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-3">
                    <input
                      type="date"
                      value={lab.dateDrawn ?? ""}
                      onChange={(e) => updateRow(i, { dateDrawn: e.target.value || undefined })}
                      className="bg-transparent text-xs text-[#5a5a5a] focus:outline-none focus:bg-white border border-transparent focus:border-[#d4c5b0] rounded px-1"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[#8b7355] truncate max-w-[160px]" title={lab.sourceFile}>
                    {lab.sourceFile ?? "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <button
                      type="button"
                      onClick={() => deleteRow(i)}
                      className="text-[#8b7355] hover:text-[#8b2500]"
                      aria-label="Delete row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
