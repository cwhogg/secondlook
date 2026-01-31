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
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 40%, #faf5ff 100%)",
          position: "relative",
          overflow: "hidden",
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
          {/* Trust badges row */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "40px",
            }}
          >
            {["HIPAA Compliant", "MD Reviewed", "Bank-Level Encryption"].map(
              (badge) => (
                <div
                  key={badge}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "9999px",
                    padding: "8px 20px",
                    fontSize: "16px",
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  {badge}
                </div>
              )
            )}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 1.1,
              marginBottom: "12px",
              background: "linear-gradient(135deg, #111827, #6b21a8, #1e40af)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            Find Your Rare Diagnosis
          </div>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              textAlign: "center",
              lineHeight: 1.1,
              marginBottom: "32px",
              background: "linear-gradient(90deg, #9333ea, #2563eb)",
              backgroundClip: "text",
              color: "transparent",
              display: "flex",
            }}
          >
            in Minutes.
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "24px",
              color: "#4b5563",
              textAlign: "center",
              maxWidth: "800px",
              lineHeight: 1.5,
              display: "flex",
            }}
          >
            AI-powered symptom analysis against thousands of rare and complex
            conditions that might be overlooked.
          </div>

          {/* Bottom branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "48px",
              gap: "12px",
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
      </div>
    ),
    { ...size }
  )
}
