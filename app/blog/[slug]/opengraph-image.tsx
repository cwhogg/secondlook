import { ImageResponse } from "next/og"
import { getContentBySlug } from "@/lib/content"

export const alt = "SecondLook Blog Post"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: { slug: string } }) {
  const piece = getContentBySlug(params.slug)
  const title = piece?.title ?? "SecondLook"
  const typeBadge =
    piece?.type === "blog"
      ? "Article"
      : piece?.type === "faq"
        ? "FAQ"
        : piece?.type === "landing-page"
          ? "Guide"
          : "Comparison"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 40%, #faf5ff 100%)",
          position: "relative",
          overflow: "hidden",
          padding: "60px 80px",
        }}
      >
        {/* Background gradient accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(147, 51, 234, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(37, 99, 235, 0.08) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "linear-gradient(90deg, #9333ea, #2563eb)",
            display: "flex",
          }}
        />

        {/* Top section: badge */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background:
                piece?.type === "blog"
                  ? "#dbeafe"
                  : piece?.type === "faq"
                    ? "#d1fae5"
                    : piece?.type === "landing-page"
                      ? "#fef3c7"
                      : "#ede9fe",
              color:
                piece?.type === "blog"
                  ? "#1d4ed8"
                  : piece?.type === "faq"
                    ? "#047857"
                    : piece?.type === "landing-page"
                      ? "#b45309"
                      : "#7c3aed",
              borderRadius: "9999px",
              padding: "8px 24px",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            {typeBadge}
          </div>
        </div>

        {/* Middle section: title */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: title.length > 60 ? "44px" : "52px",
              fontWeight: 800,
              lineHeight: 1.2,
              background: "linear-gradient(135deg, #111827, #6b21a8, #1e40af)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
              maxWidth: "1040px",
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom section: branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #9333ea, #2563eb)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "20px",
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#111827",
              display: "flex",
            }}
          >
            SecondLook
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
