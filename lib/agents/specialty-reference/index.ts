import type { SpecialistType } from "../types";
import type { SpecialtyReference } from "./types";

import { NEUROLOGY_REFERENCE } from "./neurology";
import { RHEUMATOLOGY_REFERENCE } from "./rheumatology";
import { CARDIOLOGY_REFERENCE } from "./cardiology";
import { IMMUNOLOGY_REFERENCE } from "./immunology";
import { ENDOCRINOLOGY_REFERENCE } from "./endocrinology";
import { GASTROENTEROLOGY_REFERENCE } from "./gastroenterology";
import { GENETICS_REFERENCE } from "./genetics";
import { HEMATOLOGY_REFERENCE } from "./hematology";
import { PSYCHIATRY_REFERENCE } from "./psychiatry";
import { ONCOLOGY_REFERENCE } from "./oncology";
import { PULMONOLOGY_REFERENCE } from "./pulmonology";
import { NEPHROLOGY_REFERENCE } from "./nephrology";
import { OPHTHALMOLOGY_REFERENCE } from "./ophthalmology";
import { DERMATOLOGY_REFERENCE } from "./dermatology";
import { GENERAL_INTERNAL_REFERENCE } from "./general-internal";

export type { SpecialtyReference, ClinicalFramework, MimicGroup } from "./types";

export const SPECIALTY_REFERENCES: Record<SpecialistType, SpecialtyReference> = {
  neurologist: NEUROLOGY_REFERENCE,
  rheumatologist: RHEUMATOLOGY_REFERENCE,
  cardiologist: CARDIOLOGY_REFERENCE,
  immunologist: IMMUNOLOGY_REFERENCE,
  endocrinologist: ENDOCRINOLOGY_REFERENCE,
  gastroenterologist: GASTROENTEROLOGY_REFERENCE,
  geneticist: GENETICS_REFERENCE,
  hematologist: HEMATOLOGY_REFERENCE,
  psychiatrist: PSYCHIATRY_REFERENCE,
  oncologist: ONCOLOGY_REFERENCE,
  pulmonologist: PULMONOLOGY_REFERENCE,
  nephrologist: NEPHROLOGY_REFERENCE,
  ophthalmologist: OPHTHALMOLOGY_REFERENCE,
  dermatologist: DERMATOLOGY_REFERENCE,
  "general-internist": GENERAL_INTERNAL_REFERENCE,
};

/**
 * Render a specialty reference into a single prose block suitable for
 * concatenating into the specialist agent's system prompt.
 */
export function renderSpecialtyReference(specialty: SpecialistType): string {
  const ref = SPECIALTY_REFERENCES[specialty];
  if (!ref) return "";

  const frameworks = ref.clinicalFrameworks
    .map((f, i) => `${i + 1}. ${f.name}\n   ${f.summary}`)
    .join("\n\n");

  const patterns = ref.differentialPatterns.map((p) => `- ${p}`).join("\n");
  const redFlags = ref.redFlags.map((r) => `- ${r}`).join("\n");
  const mimics = ref.commonMimics
    .map((m) => `- ${m.condition} ↔ ${m.mimics.join("; ")}`)
    .join("\n");

  return `DIAGNOSTIC FRAMEWORKS YOU APPLY:
${frameworks}

PATTERN RECOGNITION (when you see X, think Y):
${patterns}

DON'T MISS — RED FLAGS:
${redFlags}

COMMON MIMICS WITHIN YOUR SPECIALTY:
${mimics}`;
}
