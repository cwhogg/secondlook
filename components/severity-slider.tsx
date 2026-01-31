"use client"
import { useState } from "react"

interface SeveritySliderProps {
  value: number
  onChange: (value: number) => void
}

export function SeveritySlider({ value, onChange }: SeveritySliderProps) {
  const [isDragging, setIsDragging] = useState(false)

  const getSeverityLabel = (value: number) => {
    if (value <= 3) return "Mild impact - some daily activities affected"
    if (value <= 6) return "Moderate impact - many activities are difficult"
    return "Severe impact - most activities are very difficult"
  }

  const getSeverityColor = (value: number) => {
    if (value <= 3) return "text-green-600"
    if (value <= 6) return "text-yellow-500"
    return "text-red-600"
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb"
          style={{
            background: `linear-gradient(to right, #22c55e 0%, #22c55e 30%, #eab308 30%, #eab308 60%, #ef4444 60%, #ef4444 100%)`,
          }}
        />

        {/* Value indicator */}
        <div
          className={`absolute top-[-40px] transform -translate-x-1/2 transition-all duration-200 ${
            isDragging ? "scale-110" : ""
          }`}
          style={{ left: `${((value - 1) / 9) * 100}%` }}
        >
          <div className="bg-gray-900 text-white px-3 py-1 rounded-lg text-sm font-semibold">{value}</div>
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 mx-auto"></div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-sm text-gray-500">
        <span>1 - Minimal</span>
        <span>5 - Moderate</span>
        <span>10 - Extreme</span>
      </div>

      {/* Current severity description */}
      <div className="text-center">
        <div className={`text-lg font-semibold ${getSeverityColor(value)}`}>
          Level {value}: {getSeverityLabel(value)}
        </div>
      </div>

      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #1e40af;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .slider-thumb::-moz-range-thumb {
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #1e40af;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  )
}
