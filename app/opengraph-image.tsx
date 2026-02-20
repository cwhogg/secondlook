import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "SecondLook — AI-Powered Rare Disease Diagnosis Tool"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#f5f0eb",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Subtle texture overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(139, 37, 0, 0.04) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(139, 37, 0, 0.03) 0%, transparent 60%)",
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

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 80px",
            position: "relative",
          }}
        >
          {/* SL Monogram */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "14px",
              background: "#8b2500",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "36px",
            }}
          >
            <span
              style={{
                color: "#f5f0eb",
                fontSize: "40px",
                fontWeight: 700,
                fontFamily: "Georgia, serif",
                letterSpacing: -2,
                marginTop: -2,
              }}
            >
              SL
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "68px",
              fontWeight: 700,
              textAlign: "center",
              lineHeight: 1.1,
              color: "#1a1a1a",
              marginBottom: "12px",
              display: "flex",
              fontFamily: "Georgia, serif",
            }}
          >
            Find Your Rare Diagnosis
          </div>

          {/* Decorative divider */}
          <div
            style={{
              width: "80px",
              height: "3px",
              background: "#8b2500",
              marginTop: "8px",
              marginBottom: "28px",
              display: "flex",
            }}
          />

          {/* Subtitle */}
          <div
            style={{
              fontSize: "26px",
              color: "#5c5347",
              textAlign: "center",
              maxWidth: "800px",
              lineHeight: 1.5,
              display: "flex",
              fontFamily: "Georgia, serif",
            }}
          >
            AI-powered symptom analysis against thousands of rare
            and complex conditions that might be overlooked.
          </div>

          {/* Bottom branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "44px",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "22px",
                fontWeight: 400,
                color: "#8b2500",
                display: "flex",
                fontFamily: "Georgia, serif",
                letterSpacing: 3,
                textTransform: "uppercase" as const,
              }}
            >
              SecondLook
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
