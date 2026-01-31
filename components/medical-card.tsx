import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MedicalCardProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function MedicalCard({ title, description, children, className }: MedicalCardProps) {
  return (
    <Card className={cn("rounded-xl shadow-sm border-gray-100 bg-white", className)}>
      {(title || description) && (
        <CardHeader className="pb-4 px-4 sm:px-6 pt-6">
          {title && (
            <CardTitle className="text-xl sm:text-2xl font-semibold text-gray-900 leading-tight">{title}</CardTitle>
          )}
          {description && (
            <CardDescription className="text-base text-gray-600 mt-2 leading-relaxed">{description}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className="px-4 sm:px-6 pb-6">{children}</CardContent>
    </Card>
  )
}
