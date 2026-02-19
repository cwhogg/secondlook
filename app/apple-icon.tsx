import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 37,
          background: "#8b2500",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#f5f0eb",
            fontSize: 100,
            fontWeight: 700,
            fontFamily: "Georgia, serif",
            letterSpacing: -4,
            marginTop: -4,
          }}
        >
          SL
        </span>
      </div>
    ),
    { ...size }
  )
}
