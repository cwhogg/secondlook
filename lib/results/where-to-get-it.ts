// Pure helpers for the recommended-tests sections on /results/next-steps and
// /results/print. Keep this file React-free.

export type TestCategory =
  | "laboratory"
  | "genetic_testing"
  | "imaging"
  | "specialist_evaluate"
  | "other"

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  laboratory: "Lab test",
  genetic_testing: "Genetic test",
  imaging: "Imaging",
  specialist_evaluate: "Specialist visit",
  other: "Other",
}

export const CATEGORY_ORDER: TestCategory[] = [
  "laboratory",
  "genetic_testing",
  "imaging",
  "specialist_evaluate",
  "other",
]

export function normalizeCategory(testType: string): TestCategory {
  const t = (testType || "").toLowerCase()
  if (t === "specialist_evaluation" || t === "specialist_evaluate") return "specialist_evaluate"
  if (t === "laboratory" || t === "lab") return "laboratory"
  if (t === "genetic_testing" || t === "genetics") return "genetic_testing"
  if (t === "imaging") return "imaging"
  return "other"
}

export interface WhereInfo {
  blurb: string
  inPersonExamples: string[]
  online: { available: boolean; note?: string }
  costRange?: string
}

export function getWhereToGetIt(category: TestCategory, testName: string): WhereInfo {
  switch (category) {
    case "laboratory":
      return {
        blurb:
          "A standard outpatient blood (or urine) draw. Most insurance plans cover routine panels; cash-pay prices are usually $30–$200 per panel.",
        inPersonExamples: ["Quest Diagnostics", "LabCorp", "Your hospital outpatient lab"],
        online: {
          available: true,
          note:
            "Common panels (CBC, metabolic, thyroid, ANA, inflammatory markers) can be ordered without a doctor through Quest Direct, LabCorp OnDemand, or Empower DX — you pick the test online, get a requisition, and walk into a draw site.",
        },
        costRange: "$30–$200 typical",
      }
    case "genetic_testing":
      return {
        blurb:
          "Most rare-disease panels need a doctor or genetic counselor to order. Sample is usually saliva or a single blood draw. Results take 2–6 weeks.",
        inPersonExamples: ["Invitae", "GeneDx", "Variantyx", "Blueprint Genetics"],
        online: {
          available: true,
          note:
            "Several clinical genetics labs (Invitae, GeneDx) offer a sponsored-physician pathway: you submit symptoms online, their network physician signs the order, and a kit ships to your home. Many of these programs are no-cost when you have qualifying symptoms.",
        },
        costRange: "$0 (sponsored) – $3,000",
      }
    case "imaging":
      return {
        blurb:
          "Requires a doctor's order. Independent imaging centers are typically 30–70% cheaper than hospital imaging for the same scan.",
        inPersonExamples: ["RadNet", "SimonMed", "Touchstone Imaging", "Hospital radiology"],
        online: { available: false },
        costRange: "$100–$3,000 depending on scan and facility",
      }
    case "specialist_evaluate": {
      const lower = testName.toLowerCase()
      let telehealth = "Telehealth specialty visits are available for many fields and most accept insurance."
      if (lower.includes("cardio") || lower.includes("heart")) {
        telehealth = "Heartbeat Health and Sesame offer cardiology telehealth visits, including ECG/Holter interpretation."
      } else if (lower.includes("neuro")) {
        telehealth = "Synapticure (rare neuro / ALS) and Cerebral Neurology offer remote neurology consults."
      } else if (lower.includes("psych")) {
        telehealth = "Talkiatry, Cerebral, and Brightside offer telehealth psychiatry across most states."
      } else if (lower.includes("gastro")) {
        telehealth = "Oshi Health and Sesame have GI telehealth programs."
      } else if (lower.includes("genet")) {
        telehealth = "Genome Medical and GeneDx Genetic Counseling offer telehealth genetic-counseling visits."
      } else if (lower.includes("derm")) {
        telehealth = "Dermatology telehealth is widely available via Apostrophe, Curology, and most major insurers."
      } else if (lower.includes("endo")) {
        telehealth = "Paloma Health (thyroid) and Steady Health offer endocrinology telehealth."
      }
      return {
        blurb:
          "Most specialists need a referral from your primary care doctor. Many telehealth specialty services let you book directly without a referral.",
        inPersonExamples: ["Hospital-affiliated specialty clinics", "Academic medical centers (often best for rare disease)"],
        online: { available: true, note: telehealth },
      }
    }
    default:
      return {
        blurb:
          "Ask your primary care doctor for a referral or order. Academic medical centers are best for unusual or complex workups.",
        inPersonExamples: [],
        online: { available: false },
      }
  }
}
