"use client"

interface AssociatedSymptomsProps {
  bodyRegions: string[]
  value: string[]
  onChange: (value: string[]) => void
}

const symptomsByRegion = {
  whole: ["Sleep problems", "Brain fog", "Muscle weakness", "Joint pain", "Headaches", "Dizziness"],
  chest: ["Racing heart", "Chest pain", "Shortness of breath", "Swelling", "Dizziness"],
  digestive: ["Nausea", "Stomach pain", "Bloating", "Changes in appetite", "Weight changes"],
  head: ["Headaches", "Vision changes", "Dizziness", "Memory problems", "Concentration issues"],
  muscles: ["Joint stiffness", "Muscle cramps", "Weakness", "Pain", "Swelling"],
  skin: ["Rashes", "Color changes", "Texture changes", "Sensitivity", "Itching"],
}

export function AssociatedSymptoms({ bodyRegions, value, onChange }: AssociatedSymptomsProps) {
  // Get relevant symptoms based on selected body regions
  const relevantSymptoms = Array.from(
    new Set(
      bodyRegions.flatMap((region) => {
        const regionKey = region as keyof typeof symptomsByRegion
        return symptomsByRegion[regionKey] || []
      }),
    ),
  )

  // If no specific regions or only general regions, show common symptoms
  const symptomsToShow =
    relevantSymptoms.length > 0
      ? relevantSymptoms
      : ["Fatigue", "Pain", "Sleep problems", "Headaches", "Dizziness", "Nausea"]

  const handleToggle = (symptom: string) => {
    if (value.includes(symptom)) {
      onChange(value.filter((s) => s !== symptom))
    } else {
      onChange([...value, symptom])
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {symptomsToShow.map((symptom) => {
          const isSelected = value.includes(symptom)

          return (
            <label key={symptom} className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(symptom)}
                className="w-5 h-5 text-medical-primary border-2 border-gray-300 rounded focus:ring-medical-primary focus:ring-2"
              />
              <span className="text-sm font-medium text-gray-900">{symptom}</span>
            </label>
          )
        })}
      </div>

      {value.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-none p-3">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Selected symptoms ({value.length}):</span> {value.join(", ")}
          </p>
        </div>
      )}
    </div>
  )
}
