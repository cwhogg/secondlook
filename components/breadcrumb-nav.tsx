import { ChevronRight } from "lucide-react"

interface BreadcrumbItem {
  label: string
  href?: string
  current?: boolean
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbNav({ items }: BreadcrumbNavProps) {
  return (
    <nav
      className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm mb-4 sm:mb-6 overflow-x-auto"
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <div key={index} className="flex items-center flex-shrink-0">
          {index > 0 && <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mx-1 sm:mx-2 flex-shrink-0" />}
          <span
            className={`whitespace-nowrap ${
              item.current ? "text-[#8b2500] font-medium" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {item.label}
          </span>
        </div>
      ))}
    </nav>
  )
}
