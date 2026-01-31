"use client"

interface ReviewSummaryProps {
  step1Data: any
  step2Data: any
  step3Data: any
  mappedSymptoms: any[]
}

export function ReviewSummary({ step1Data, step2Data, step3Data, mappedSymptoms }: ReviewSummaryProps) {
  const getMedicationCount = () => {
    if (step3Data.medicationPath === "none") return 0
    if (step3Data.medicationPath === "few") return step3Data.medications.length
    if (step3Data.medicationPath === "many") {
      const lines = step3Data.medicationsBulk.split("\n").filter((line: string) => line.trim())
      return lines.length
    }
    return 0
  }

  const getCareDescription = () => {
    switch (step3Data.medicalCare) {
      case "none":
        return "No doctors seen yet"
      case "primary":
        return "Primary care doctor only"
      case "specialists":
        return `Specialists (${step3Data.specialistType || "unspecified"})`
      case "emergency":
        return `Emergency room visits (${step3Data.erVisits || 0})`
      default:
        return "Not specified"
    }
  }

  return (
    <div className="space-y-6 bg-gray-50 rounded-xl p-6">
      {/* Demographics */}
      <div>
        <h3 className="font-medium text-gray-900 mb-2">Demographics</h3>
        <p className="text-sm text-gray-600">
          {step1Data.age} year old {step1Data.biologicalSex}
        </p>
      </div>

      {/* Main Concern */}
      <div>
        <h3 className="font-medium text-gray-900 mb-2">Main Concern</h3>
        <p className="text-sm text-gray-600">
          {step1Data.primaryConcern.length > 100
            ? `${step1Data.primaryConcern.substring(0, 100)}...`
            : step1Data.primaryConcern}
        </p>
      </div>

      {/* Symptoms Summary */}
      <div>
        <h3 className="font-medium text-gray-900 mb-2">Symptoms Summary</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• {mappedSymptoms.length} symptoms identified</p>
          <p>• Started: {step2Data.mainSymptomStart || "Not specified"}</p>
          <p>• Severity: {step1Data.severity}/10</p>
          <p>• Pattern: {step2Data.symptomPattern || "Not specified"}</p>
        </div>
      </div>

      {/* Medical Context */}
      <div>
        <h3 className="font-medium text-gray-900 mb-2">Medical Context</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• Medications: {getMedicationCount()}</p>
          <p>• Care received: {getCareDescription()}</p>
          <p>• Tests completed: {step3Data.testingHistory.length}</p>
        </div>
      </div>

      {/* Body Regions */}
      <div>
        <h3 className="font-medium text-gray-900 mb-2">Affected Areas</h3>
        <p className="text-sm text-gray-600">
          {step1Data.bodyRegions
            .map((region: string) => {
              const regionLabels: Record<string, string> = {
                head: "Head/Brain",
                chest: "Heart/Chest",
                digestive: "Digestive",
                muscles: "Muscles/Joints",
                skin: "Skin",
                whole: "Whole body",
              }
              return regionLabels[region] || region
            })
            .join(", ")}
        </p>
      </div>
    </div>
  )
}
