"use client"

interface TriggerSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

const triggers = [
  "Physical activity / Exercise",
  "Stress or emotions",
  "Certain foods",
  "Weather changes",
  "Lack of sleep",
  "Time of day (morning/evening)",
  "Monthly cycle (if applicable)",
  "Nothing specific",
  "I haven't noticed patterns",
]

export function TriggerSelector({ value, onChange }: TriggerSelectorProps) {
  const handleToggle = (trigger: string) => {
    if (value.includes(trigger)) {
      onChange(value.filter((t) => t !== trigger))
    } else {
      onChange([...value, trigger])
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {triggers.map((trigger) => {
        const isSelected = value.includes(trigger)

        return (
          <label key={trigger} className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggle(trigger)}
              className="w-5 h-5 text-medical-primary border-2 border-gray-300 rounded focus:ring-medical-primary focus:ring-2"
            />
            <span className="text-sm font-medium text-gray-900">{trigger}</span>
          </label>
        )
      })}
    </div>
  )
}
