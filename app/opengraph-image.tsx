import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt =
  "SecondLook — nearly 1 in 2 patients get the correct rare-disease diagnosis at position #1"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * Open Graph card, used by Twitter/X, LinkedIn, iMessage, Slack, and every
 * other unfurler. Composition, top → bottom:
 *   - small SL monogram + SECONDLOOK wordmark row
 *   - serif headline "Find Your Rare Diagnosis"
 *   - burgundy divider
 *   - the punch: "Nearly 1 in 2" set huge, with the qualifier under it
 *   - subtle burgundy accent bars at top and bottom
 *
 * Every element with children carries `display: flex` because @vercel/og's
 * satori runtime rejects the CSS default (block).
 */
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
          padding: "56px 80px",
        }}
      >
        {/* Radial warmth so the flat cream doesn't feel dead */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(139, 37, 0, 0.05) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(139, 37, 0, 0.04) 0%, transparent 60%)",
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
            height: "6px",
            background: "#8b2500",
            display: "flex",
          }}
        />

        {/* Top brand row: SL monogram + wordmark. Slightly smaller than the
            previous solo monogram so the stat below can breathe. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "36px",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: "#8b2500",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                color: "#f5f0eb",
                fontSize: "30px",
                fontWeight: 700,
                fontFamily: "Georgia, serif",
                letterSpacing: -1,
                marginTop: -2,
              }}
            >
              SL
            </span>
          </div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 400,
              color: "#8b2500",
              letterSpacing: 4,
              textTransform: "uppercase" as const,
              display: "flex",
              fontFamily: "Georgia, serif",
            }}
          >
            SecondLook
          </div>
        </div>

        {/* Headline — unchanged from the prior card so brand recall carries */}
        <div
          style={{
            fontSize: "58px",
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.1,
            color: "#1a1a1a",
            display: "flex",
            fontFamily: "Georgia, serif",
            position: "relative",
          }}
        >
          Find Your Rare Diagnosis
        </div>

        {/* Decorative divider */}
        <div
          style={{
            width: "72px",
            height: "3px",
            background: "#8b2500",
            marginTop: "22px",
            marginBottom: "36px",
            display: "flex",
            position: "relative",
          }}
        />

        {/* The punch — the stat that stops the scroll when the card auto-
            expands on Twitter/X. Two-line stack: enormous number in burgundy
            on top, supporting sentence beneath in warm gray. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: "104px",
              fontWeight: 700,
              color: "#8b2500",
              lineHeight: 1,
              letterSpacing: -2,
              display: "flex",
              fontFamily: "Georgia, serif",
            }}
          >
            Nearly 1 in 2
          </div>
          <div
            style={{
              fontSize: "32px",
              color: "#5c5347",
              textAlign: "center",
              maxWidth: "900px",
              lineHeight: 1.4,
              marginTop: "22px",
              display: "flex",
              fontFamily: "Georgia, serif",
            }}
          >
            get the correct diagnosis at position #1.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
