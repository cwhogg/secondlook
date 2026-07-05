/**
 * Client-side "mute all tracking" flag. When set, the session tracker,
 * Google Analytics, Vercel Analytics, and Vercel SpeedInsights are all
 * suppressed on that browser.
 *
 * Persistence: localStorage so the flag survives across visits and tabs.
 * A URL query param `?mute=1` from any device sets the flag on that
 * device without needing an admin login. `?mute=0` clears it.
 */

const KEY = 'sl_no_track'

export function isTrackingMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setTrackingMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (muted) window.localStorage.setItem(KEY, '1')
    else window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * On mount, read `?mute=1` or `?mute=0` from the URL and persist the
 * flag. Lets internal users flip mute state on any browser (personal
 * laptop, phone, secondary device) without going through admin.
 */
export function honorMuteQueryParam(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const v = params.get('mute')
  if (v === '1') setTrackingMuted(true)
  else if (v === '0') setTrackingMuted(false)
}
