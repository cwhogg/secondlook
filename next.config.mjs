/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: false,
  },
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/eval-case': ['./scripts/benchmark-data/en.jsonl'],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent results-page URLs (containing requestId that grants
          // access to /api/get-analysis/[requestId]) from leaking via the
          // Referer header to any external site linked from the report.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Defense-in-depth: block clickjacking of any page (results,
          // feedback modal, admin) and content-type sniffing.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default nextConfig
