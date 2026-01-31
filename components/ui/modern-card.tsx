"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface ModernCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "hover" | "interactive"
  padding?: "none" | "sm" | "md" | "lg"
  children: React.ReactNode
}

const ModernCard = React.forwardRef<HTMLDivElement, ModernCardProps>(
  ({ className, variant = "default", padding = "md", children, ...props }, ref) => {
    const baseClasses = "card-modern"

    const variantClasses = {
      default: "",
      hover: "card-modern-hover",
      interactive: "card-modern-interactive card-modern-hover",
    }

    const paddingClasses = {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    }

    return (
      <div
        className={cn(baseClasses, variantClasses[variant], paddingClasses[padding], className)}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )
  },
)

ModernCard.displayName = "ModernCard"

export { ModernCard }
