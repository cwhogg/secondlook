"use client"

import type React from "react"
import { cn } from "@/lib/utils"

interface TouchFriendlyButtonProps {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "outline" | "ghost"
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  onClick?: () => void
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  fullWidth?: boolean
  hapticFeedback?: boolean
}

export function TouchFriendlyButton({
  children,
  variant = "primary",
  size = "md",
  className,
  onClick,
  disabled,
  type = "button",
  fullWidth = false,
  hapticFeedback = true,
}: TouchFriendlyButtonProps) {
  const handleClick = () => {
    // Haptic feedback for supported devices
    if (hapticFeedback && "vibrate" in navigator) {
      navigator.vibrate(10) // Short vibration
    }

    if (onClick) {
      onClick()
    }
  }

  const baseClasses = cn(
    "font-medium rounded-none transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-medical-primary",
    "transform", // Touch feedback
    "select-none", // Prevent text selection on touch
    fullWidth && "w-full",
    disabled && "opacity-50 cursor-not-allowed active:scale-100",
  )

  const variantClasses = {
    primary: "bg-medical-primary hover:bg-[#6d1d00] text-white shadow-sm hover:shadow-md active:shadow-sm",
    secondary: "bg-medical-secondary hover:bg-[#8b2500] text-white shadow-sm hover:shadow-md active:shadow-sm",
    outline: "border-2 border-medical-primary text-medical-primary hover:bg-medical-primary hover:text-white bg-white",
    ghost: "text-medical-primary hover:bg-[#faf6f0] active:bg-[#faf6f0]",
  }

  const sizeClasses = {
    sm: "px-4 py-3 text-sm min-h-[44px]", // 44px minimum touch target
    md: "px-6 py-4 text-base min-h-[48px]", // 48px for better mobile UX
    lg: "px-8 py-5 text-lg min-h-[52px]", // 52px for primary actions
    xl: "px-10 py-6 text-xl min-h-[56px]", // 56px for hero buttons
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      // Ensure proper touch target size
      style={{ minWidth: size === "sm" ? "44px" : size === "md" ? "48px" : size === "lg" ? "52px" : "56px" }}
    >
      {children}
    </button>
  )
}
