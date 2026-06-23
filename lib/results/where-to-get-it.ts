// Pure helpers for the recommended-tests sections on /results/next-steps and
// /results/print. Keep this file React-free.

export type TestCategory =
  | "laboratory"
  | "genetic_testing"
  | "imaging"
  | "electrodiagnostic"
  | "specialist_evaluate"
  | "other"

export const CATEGORY_LABELS: Record<TestCategory, string> = {
  laboratory: "Lab test",
  genetic_testing: "Genetic test",
  imaging: "Imaging",
  electrodiagnostic: "Electrodiagnostic",
  specialist_evaluate: "Specialist visit",
  other: "Other",
}

export const CATEGORY_ORDER: TestCategory[] = [
  "laboratory",
  "genetic_testing",
  "imaging",
  "electrodiagnostic",
  "specialist_evaluate",
  "other",
]

// Detect electrodiagnostic procedures from the test name when the upstream
// testType is generic ("laboratory" / "other"). These are clinic-based
// neurology procedures that don't fit the lab-draw / imaging / consultation
// channels and should NOT be presented as orderable via Quest Direct.
const ELECTRODIAGNOSTIC_HINTS = [
  "emg",
  "electromyograph",
  "nerve conduction",
  "ncs",
  "rns",
  "repetitive nerve stim",
  "sfemg",
  "single-fiber electromyograph",
  "single fiber electromyograph",
  "eeg",
  "electroencephalograph",
  "evoked potential",
  "polysomnograph", // sleep studies
  "tilt table",
  "autonomic testing",
  "qsart",
]

export function normalizeCategory(testType: string, testName?: string): TestCategory {
  const t = (testType || "").toLowerCase()
  const n = (testName || "").toLowerCase()

  // testName-based detection wins when the upstream category is too coarse.
  // EMG/RNS/SFEMG and similar should never get the lab-draw template even if
  // the specialist labelled them "laboratory" or "other".
  if (ELECTRODIAGNOSTIC_HINTS.some((h) => n.includes(h))) {
    return "electrodiagnostic"
  }

  if (t === "electrodiagnostic") return "electrodiagnostic"
  if (t === "specialist_evaluation" || t === "specialist_evaluate") return "specialist_evaluate"
  if (t === "laboratory" || t === "lab") return "laboratory"
  if (t === "genetic_testing" || t === "genetics") return "genetic_testing"
  if (t === "imaging") return "imaging"
  return "other"
}

export interface WhereInfo {
  /**
   * One-to-two sentence description of WHAT the test physically involves —
   * blood draw, scan, in-clinic procedure, telehealth consult — and any
   * notable practical details. No pricing language.
   */
  process: string
  /**
   * Short label about whether the patient needs a doctor to obtain the test.
   * Surfaced as a small badge in the UI so the answer is glanceable.
   * Examples: "Doctor order required", "Doctor order usually required",
   * "Often available without a doctor".
   */
  doctorOrder: string
  /** Specific places where the test is physically performed. */
  inPersonExamples: string[]
  /** Direct-to-consumer pathway if one genuinely exists for this kind of test. */
  online: { available: boolean; note?: string }
}

export function getWhereToGetIt(category: TestCategory, testName: string): WhereInfo {
  switch (category) {
    case "laboratory":
      return {
        process:
          "An outpatient blood, urine, or other-fluid sample. The draw itself usually takes a few minutes; turnaround for routine results is 1–3 days, longer for specialty panels.",
        doctorOrder:
          "Doctor order usually required (routine panels can sometimes be ordered direct)",
        inPersonExamples: ["Quest Diagnostics", "LabCorp", "Your hospital outpatient lab"],
        online: {
          available: true,
          note:
            "Common routine panels (CBC, metabolic, thyroid, ANA, inflammatory markers) can be ordered without a doctor through Quest Direct, LabCorp OnDemand, or Empower DX — you pick the test online, get a requisition, and walk into a draw site. Specialty, autoimmune, or rare-disease panels usually still need a physician order.",
        },
      }
    case "genetic_testing":
      return {
        process:
          "A single blood draw or saliva sample. Most rare-disease panels are sent to a specialty genetics lab and take 2–6 weeks to return.",
        doctorOrder:
          "Doctor or genetic counselor usually required (sponsored-physician programs available)",
        inPersonExamples: ["Invitae", "GeneDx", "Variantyx", "Blueprint Genetics"],
        online: {
          available: true,
          note:
            "Several clinical genetics labs (Invitae, GeneDx) offer a sponsored-physician pathway: you submit symptoms online, their network physician signs the order, and a kit ships to your home. Many of these programs are no-cost when you have qualifying symptoms.",
        },
      }
    case "imaging":
      return {
        process:
          "A scan (X-ray, ultrasound, CT, or MRI) at a hospital radiology department or independent imaging center. Most studies take 15–60 minutes; the radiologist's report typically follows in 1–3 days.",
        doctorOrder: "Doctor order required",
        inPersonExamples: [
          "RadNet",
          "SimonMed",
          "Touchstone Imaging",
          "Hospital radiology",
        ],
        online: { available: false },
      }
    case "electrodiagnostic":
      return {
        process:
          "A clinic-based procedure performed and interpreted by a neurologist or trained technologist. Involves placing surface (or fine-needle) electrodes; the visit usually runs 30–90 minutes depending on which studies are included.",
        doctorOrder: "Doctor order and in-person visit required",
        inPersonExamples: [
          "Hospital neurology / neurodiagnostic lab",
          "Academic medical centers",
          "Neuromuscular specialty clinics",
        ],
        online: { available: false },
      }
    case "specialist_evaluate": {
      const lower = testName.toLowerCase()
      let telehealth =
        "Telehealth specialty visits are available for many fields and most accept insurance."
      if (lower.includes("cardio") || lower.includes("heart")) {
        telehealth =
          "Heartbeat Health and Sesame offer cardiology telehealth visits, including ECG/Holter interpretation."
      } else if (lower.includes("neuro")) {
        telehealth =
          "Synapticure (rare neuro / ALS) and Cerebral Neurology offer remote neurology consults."
      } else if (lower.includes("psych")) {
        telehealth =
          "Talkiatry, Cerebral, and Brightside offer telehealth psychiatry across most states."
      } else if (lower.includes("gastro")) {
        telehealth = "Oshi Health and Sesame have GI telehealth programs."
      } else if (lower.includes("genet")) {
        telehealth =
          "Genome Medical and GeneDx Genetic Counseling offer telehealth genetic-counseling visits."
      } else if (lower.includes("derm")) {
        telehealth =
          "Dermatology telehealth is widely available via Apostrophe, Curology, and most major insurers."
      } else if (lower.includes("endo")) {
        telehealth = "Paloma Health (thyroid) and Steady Health offer endocrinology telehealth."
      }
      return {
        process:
          "An in-person clinic visit or telehealth consult with a board-certified specialist. Expect a focused history, exam, and a follow-up plan for any further testing.",
        doctorOrder:
          "Primary-care referral often required for in-person; many telehealth services book direct",
        inPersonExamples: [
          "Hospital-affiliated specialty clinics",
          "Academic medical centers (often best for rare disease)",
        ],
        online: { available: true, note: telehealth },
      }
    }
    default:
      return {
        process:
          "Specifics depend on the test. Ask your primary care doctor for a referral or order. Academic medical centers are best for unusual or complex workups.",
        doctorOrder: "Doctor order or referral typically required",
        inPersonExamples: [],
        online: { available: false },
      }
  }
}
