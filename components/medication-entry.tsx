"use client"

import { X, Check } from "lucide-react"
import { MedicalButton } from "./medical-button"

interface Medication {
  id: string
  name: string
  type: "prescription" | "otc" | "supplement"
  submitted?: boolean
  parsed?: {
    standardizedName: string
    genericName?: string
    brandNames?: string[]
    ndcCode?: string
    drugClass?: string
    confidence: string
    notes?: string
  }
}

interface MedicationEntryProps {
  medication: Medication
  onUpdate: (id: string, field: keyof Medication, value: string) => void
  onRemove: (id: string) => void
  onSubmit: (id: string) => void
}

export function MedicationEntry({ medication, onUpdate, onRemove, onSubmit }: MedicationEntryProps) {
  const canSubmit = medication.name.trim().length > 0 && !medication.submitted

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
      <div className="flex justify-between items-start">
        <h4 className="text-sm font-medium text-gray-900">Medication</h4>
        <button
          type="button"
          onClick={() => onRemove(medication.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Medication name</label>
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="e.g., Ibuprofen, Vitamin D, Metformin..."
              value={medication.name}
              onChange={(e) => onUpdate(medication.id, "name", e.target.value)}
              disabled={medication.submitted}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-primary focus:border-medical-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {canSubmit && (
              <MedicalButton onClick={() => onSubmit(medication.id)} size="sm" className="flex items-center space-x-1">
                <Check className="h-4 w-4" />
                <span>Submit</span>
              </MedicalButton>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "prescription", label: "Prescription" },
              { id: "otc", label: "Over-the-counter" },
              { id: "supplement", label: "Supplement" },
            ].map((option) => (
              <label key={option.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name={`medication-type-${medication.id}`}
                  value={option.id}
                  checked={medication.type === option.id}
                  onChange={(e) => onUpdate(medication.id, "type", e.target.value as any)}
                  disabled={medication.submitted}
                  className="w-4 h-4 text-medical-primary border-gray-300 focus:ring-medical-primary focus:ring-2 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-gray-900">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Show parsed information if available */}
        {medication.submitted && medication.parsed && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm">
              <div className="font-medium text-blue-900 mb-2">Parsed Information:</div>
              <div className="space-y-1 text-blue-800">
                <div>
                  <span className="font-medium">Standardized name:</span> {medication.parsed.standardizedName}
                </div>
                {medication.parsed.genericName &&
                  medication.parsed.genericName !== medication.parsed.standardizedName && (
                    <div>
                      <span className="font-medium">Generic name:</span> {medication.parsed.genericName}
                    </div>
                  )}
                {medication.parsed.brandNames && medication.parsed.brandNames.length > 0 && (
                  <div>
                    <span className="font-medium">Brand names:</span> {medication.parsed.brandNames.join(", ")}
                  </div>
                )}
                {medication.parsed.ndcCode && (
                  <div>
                    <span className="font-medium">NDC code:</span> {medication.parsed.ndcCode}
                  </div>
                )}
                {medication.parsed.drugClass && (
                  <div>
                    <span className="font-medium">Drug class:</span> {medication.parsed.drugClass}
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <span className="font-medium">Confidence:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      medication.parsed.confidence === "high"
                        ? "bg-green-100 text-green-800"
                        : medication.parsed.confidence === "medium"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {medication.parsed.confidence}
                  </span>
                </div>
                {medication.parsed.notes && (
                  <div>
                    <span className="font-medium">Notes:</span> {medication.parsed.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Show submitted status */}
        {medication.submitted && (
          <div className="flex items-center space-x-2 text-green-600">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Submitted</span>
          </div>
        )}
      </div>
    </div>
  )
}
