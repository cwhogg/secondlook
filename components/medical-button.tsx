"use client"

import React from "react"
import { ModernButton } from "@/components/ui/modern-button"
import { cn } from "@/lib/utils"

interface MedicalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "warning" | "error" | "outline" | "ghost"
  size?: "sm" | "md" | "lg" | "xl"
  loading?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  fullWidth?: boolean
}

const MedicalButton = React.forwardRef<HTMLButtonElement, MedicalButtonProps>(
  ({ className, variant = "primary", fullWidth = false, ...props }, ref) => {
    return (
      <ModernButton
        className={cn("font-semibold tracking-wide", fullWidth && "w-full", className)}
        variant={variant}
        ref={ref}
        {...props}
      />
    )
  },
)

MedicalButton.displayName = "MedicalButton"

export { MedicalButton }
