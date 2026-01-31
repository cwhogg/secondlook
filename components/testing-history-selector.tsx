"use client"

interface TestingHistorySelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

const testingOptions = [
  { id: "blood", label: "Blood tests", description: "CBC, metabolic panel, etc." },
  { id: "imaging", label: "X-rays or scans", description: "CT, MRI, ultrasound" },
  { id: "heart", label: "Heart tests", description: "EKG, echocardiogram" },
  { id: "specialized", label: "Other specialized tests", description: "Endoscopy, biopsy, etc." },
  { id: "none", label: "No tests yet", description: "Haven't had any testing" },
]

export function TestingHistorySelector({ value, onChange }: TestingHistorySelectorProps) {
  const handleToggle = (testId: string) => {
    if (testId === "none") {
      // If selecting "none", clear all others
      onChange(value.includes("none") ? [] : ["none"])
    } else {
      // If selecting any other test, remove "none" and toggle the test
      const withoutNone = value.filter((id) => id !== "none")
      if (withoutNone.includes(testId)) {
        onChange(withoutNone.filter((id) => id !== testId))
      } else {
        onChange([...withoutNone, testId])
      }
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {testingOptions.map((option) => {
        const isSelected = value.includes(option.id)

        return (
          <label key={option.id} className="cursor-pointer">
            <div
              className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? "border-medical-primary bg-blue-50 text-medical-primary"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(option.id)}
                  className="w-5 h-5 text-medical-primary border-2 border-gray-300 rounded focus:ring-medical-primary focus:ring-2 mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium mb-1">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.description}</div>
                </div>
              </div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
