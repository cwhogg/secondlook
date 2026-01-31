"use client"

import React from "react"
import { CheckCircle, AlertCircle, XCircle, Info, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusBarProps {
  variant: "success" | "warning" | "error" | "info" | "pending"
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  onDismiss?: () => void
}

const StatusBar = React.forwardRef<HTMLDivElement, StatusBarProps>(
  ({ variant, title, description, action, className, onDismiss }, ref) => {
    const icons = {
      success: CheckCircle,
      warning: AlertCircle,
      error: XCircle,
      info: Info,
      pending: Clock,
    }

    const Icon = icons[variant]

    const variantClasses = {
      success: "status-bar-success",
      warning: "status-bar-warning",
      error: "status-bar-error",
      info: "status-bar-info",
      pending: "status-bar-pending",
    }

    return (
      <div className={cn("status-bar", variantClasses[variant], className)} ref={ref} role="alert" aria-live="polite">
        <div className="flex items-start gap-3 flex-1">
          <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{title}</div>
            {description && <div className="text-sm opacity-90 mt-1">{description}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-current hover:opacity-70 transition-opacity"
              aria-label="Dismiss"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  },
)

StatusBar.displayName = "StatusBar"

export { StatusBar }
