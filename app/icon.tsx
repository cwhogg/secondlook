import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "#8b2500",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#f5f0eb",
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "Georgia, serif",
            letterSpacing: -1,
            marginTop: -1,
          }}
        >
          SL
        </span>
      </div>
    ),
    { ...size }
  )
}
