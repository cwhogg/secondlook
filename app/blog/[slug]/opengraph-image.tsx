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

  const badgeColor =
    piece?.type === "blog"
      ? { bg: "rgba(139, 37, 0, 0.1)", text: "#8b2500" }
      : piece?.type === "faq"
        ? { bg: "rgba(75, 85, 50, 0.1)", text: "#4b5532" }
        : piece?.type === "landing-page"
          ? { bg: "rgba(139, 100, 0, 0.1)", text: "#8b6400" }
          : { bg: "rgba(90, 70, 60, 0.1)", text: "#5a463c" }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f5f0eb",
          position: "relative",
          overflow: "hidden",
          padding: "60px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Subtle texture */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(139, 37, 0, 0.03) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(139, 37, 0, 0.02) 0%, transparent 50%)",
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
            height: "5px",
            background: "#8b2500",
            display: "flex",
          }}
        />

        {/* Bottom accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "5px",
            background: "#8b2500",
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
              background: badgeColor.bg,
              color: badgeColor.text,
              borderRadius: "0px",
              padding: "8px 20px",
              fontSize: "18px",
              fontWeight: 600,
              fontFamily: "Georgia, serif",
              letterSpacing: 1,
              textTransform: "uppercase" as const,
              border: `1px solid ${badgeColor.text}20`,
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
              fontWeight: 700,
              lineHeight: 1.25,
              color: "#1a1a1a",
              display: "flex",
              maxWidth: "1040px",
              fontFamily: "Georgia, serif",
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
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                background: "#8b2500",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: "#f5f0eb",
                  fontSize: "20px",
                  fontWeight: 700,
                  fontFamily: "Georgia, serif",
                  letterSpacing: -1,
                  marginTop: -1,
                }}
              >
                SL
              </span>
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 400,
                color: "#8b2500",
                display: "flex",
                fontFamily: "Georgia, serif",
                letterSpacing: 2,
                textTransform: "uppercase" as const,
              }}
            >
              SecondLook
            </div>
          </div>

          {/* Decorative line */}
          <div
            style={{
              width: "60px",
              height: "2px",
              background: "#d4c5b0",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  )
}
