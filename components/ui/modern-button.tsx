"use client"

import React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModernButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "warning" | "error" | "outline" | "ghost"
  size?: "sm" | "md" | "lg" | "xl"
  loading?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}

const ModernButton = React.forwardRef<HTMLButtonElement, ModernButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, icon, children, disabled, ...props }, ref) => {
    const baseClasses = "btn-modern touch-target"

    const variantClasses = {
      primary: "btn-primary",
      secondary: "btn-secondary",
      success: "btn-success",
      warning: "btn-warning",
      error: "btn-error",
      outline: "btn-outline",
      ghost: "btn-ghost",
    }

    const sizeClasses = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
      xl: "px-10 py-5 text-xl",
    }

    return (
      <button
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          loading && "cursor-not-allowed",
          className,
        )}
        disabled={disabled || loading}
        ref={ref}
        {...props}
      >
        <div className="flex items-center justify-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : icon ? (
            <span className="flex-shrink-0">{icon}</span>
          ) : null}
          <span>{children}</span>
        </div>
      </button>
    )
  },
)

ModernButton.displayName = "ModernButton"

export { ModernButton }
