import Link from "next/link"

export default function AdminIndexPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin</h1>
        <p className="text-sm text-gray-600 mb-6">Internal tools.</p>

        <div className="grid gap-3">
          <Link
            href="/admin/runs"
            className="block bg-white border border-gray-200 p-5 hover:border-[#8b2500] transition-colors"
          >
            <div className="font-semibold text-gray-900 mb-1">Production Runs</div>
            <div className="text-sm text-gray-600">
              Every successful patient analysis from <code>/analyze-patient-v2</code> — top diagnosis, confidence, IP, full report on click.
            </div>
          </Link>

          <Link
            href="/admin/testing"
            className="block bg-white border border-gray-200 p-5 hover:border-[#8b2500] transition-colors"
          >
            <div className="font-semibold text-gray-900 mb-1">Testing Framework</div>
            <div className="text-sm text-gray-600">
              Generate synthetic patient cases, run the V2 pipeline against them, grade against ground truth.
            </div>
          </Link>

          <Link
            href="/eval"
            className="block bg-white border border-gray-200 p-5 hover:border-[#8b2500] transition-colors"
          >
            <div className="font-semibold text-gray-900 mb-1">Phenopacket2Prompt Eval</div>
            <div className="text-sm text-gray-600">
              Run published benchmark cases against the live pipeline, paper-faithful Mondo grading.
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
