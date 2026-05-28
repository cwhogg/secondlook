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
}

export default nextConfig
