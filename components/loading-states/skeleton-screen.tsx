"use client"

import { cn } from "@/lib/utils"

interface SkeletonScreenProps {
  variant?: "form" | "card" | "list" | "analysis"
  className?: string
}

export function SkeletonScreen({ variant = "form", className }: SkeletonScreenProps) {
  const SkeletonBox = ({ className: boxClassName }: { className?: string }) => (
    <div className={cn("bg-gray-200 rounded animate-pulse", boxClassName)} />
  )

  const renderFormSkeleton = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <SkeletonBox className="h-8 w-3/4 mx-auto" />
        <SkeletonBox className="h-4 w-1/2 mx-auto" />
      </div>

      {/* Form Fields */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <SkeletonBox className="h-4 w-1/4" />
          <SkeletonBox className="h-12 w-full rounded-none" />
        </div>
      ))}

      {/* Button */}
      <SkeletonBox className="h-12 w-full rounded-none" />
    </div>
  )

  const renderCardSkeleton = () => (
    <div className="bg-white rounded-none p-6 space-y-4">
      <div className="flex items-center space-x-3">
        <SkeletonBox className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <SkeletonBox className="h-4 w-3/4" />
          <SkeletonBox className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonBox className="h-20 w-full" />
      <div className="flex space-x-2">
        <SkeletonBox className="h-8 w-20 rounded-none" />
        <SkeletonBox className="h-8 w-24 rounded-none" />
      </div>
    </div>
  )

  const renderListSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center space-x-3 p-4 bg-white rounded-none">
          <SkeletonBox className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <SkeletonBox className="h-4 w-3/4" />
            <SkeletonBox className="h-3 w-1/2" />
          </div>
          <SkeletonBox className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )

  const renderAnalysisSkeleton = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#8b2500] rounded-none p-6 text-white">
        <div className="space-y-3">
          <SkeletonBox className="h-8 w-2/3 bg-white bg-opacity-20" />
          <SkeletonBox className="h-4 w-1/2 bg-white bg-opacity-20" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center">
              <SkeletonBox className="h-8 w-full bg-white bg-opacity-20 mb-2" />
              <SkeletonBox className="h-3 w-full bg-white bg-opacity-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Content Cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-none p-6 space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBox className="h-6 w-1/3" />
            <SkeletonBox className="h-8 w-16 rounded-full" />
          </div>
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-3/4" />
          <div className="grid grid-cols-2 gap-4">
            <SkeletonBox className="h-20 w-full" />
            <SkeletonBox className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  )

  const skeletonVariants = {
    form: renderFormSkeleton,
    card: renderCardSkeleton,
    list: renderListSkeleton,
    analysis: renderAnalysisSkeleton,
  }

  return <div className={cn("animate-pulse", className)}>{skeletonVariants[variant]()}</div>
}
