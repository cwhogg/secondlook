interface CharacterCounterProps {
  current: number
  max: number
}

export function CharacterCounter({ current, max }: CharacterCounterProps) {
  const getColor = () => {
    if (current > max) return "text-red-600"
    if (current > max * 0.9) return "text-yellow-600"
    return "text-green-600"
  }

  return (
    <div className={cn("text-sm font-medium", getColor())}>
      {current}/{max} characters
    </div>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ")
}
