"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnalysisLoading } from "@/components/analysis-loading"
import { TestUserGroundTruthBanner } from "@/components/test-user-ground-truth-banner"
import { mapSingleSymptom } from "@/lib/symptom-parser"
import { trackEvent } from "@/lib/session-tracker"
import type { PipelineProgress } from "@/lib/types/pipeline"

interface Step1Data {
  age: string
  biologicalSex: string
}

interface Step2Data {
  primaryConcern: string
  mainSymptomStart?: string
  severity?: number
  // Legacy fields tolerated for in-flight drafts started before the
  // restructure: labs used to live on step-2; the patient-theory field
  // was removed.
  labResults?: any[]
  patientHypothesis?: string
  noIdea?: boolean
}

interface Step3Data {
  labResults?: any[]
  photos?: Step4SymptomPhoto[]
  documents?: { fileName: string; extractedText: string }[]
}

interface Step4SymptomPhoto {
  description: string
  bodyPart?: string
  fileName?: string
}

interface Step4Data {
  photos?: Step4SymptomPhoto[]
}

interface Step5Data {
  consentAnalysis?: boolean
  consentNotSubstitute?: boolean
  consentAccurate?: boolean
  // Legacy fields tolerated for drafts in flight at the time of the
  // step-2 ⇄ step-5 swap.
  mainSymptomStart?: string
  severity?: number
}

function combineNarrativeAndPhotos(
  primaryConcern: string,
  photos: Step4SymptomPhoto[] | undefined,
): string {
  const ps = Array.isArray(photos) ? photos : []
  if (ps.length === 0) return primaryConcern
  const block = ps
    .map((p) =>
      p.bodyPart ? `${p.bodyPart}: ${p.description}` : p.description,
    )
    .join("\n")
  const sep = primaryConcern.trim()
    ? "\n\n--- Visible findings (from uploaded photos) ---\n\n"
    : ""
  return `${primaryConcern}${sep}${block}`
}

/**
 * Common success handler. Used by both the SSE 'result' event and the
 * resume-from-KV path so they produce identical sessionStorage + nav.
 */
function handleAnalysisResult(
  analysis: any,
  startTime: number,
  parsedStep1: Step1Data,
  parsedStep2: Step2Data,
  analysisPayload: any,
  router: ReturnType<typeof useRouter>,
) {
  const processingTime = Date.now() - startTime
  const analysisResults = {
    differentialDiagnoses: analysis.differentialDiagnoses || [],
    differentialClusters: analysis.differentialClusters || [],
    familyEnrichments: analysis.familyEnrichments || undefined,
    excludedCommonDiagnoses: analysis.excludedCommonDiagnoses || [],
    dataGaps: analysis.dataGaps || [],
    recommendedTesting: analysis.recommendedTesting || [],
    nextSteps: analysis.nextSteps || {},
    overallAssessment: analysis.overallAssessment || "",
    patientHypothesisAnalysis: analysis.patientHypothesisAnalysis || null,
    pipelineMetadata: analysis.pipelineMetadata || null,
    clarifyingQuestions: analysis.clarifyingQuestions || undefined,
    lowConfidenceWarning: analysis.lowConfidenceWarning || undefined,
  }
  const analysisMetadata = {
    timestamp: new Date().toLocaleString(),
    processingTime,
    patientAge: parsedStep1.age,
    patientSex: parsedStep1.biologicalSex,
    patientHypothesis: parsedStep2.patientHypothesis,
  }
  sessionStorage.setItem("analysisResults", JSON.stringify(analysisResults))
  sessionStorage.setItem("analysisMetadata", JSON.stringify(analysisMetadata))
  sessionStorage.setItem("analysisPatientCase", JSON.stringify(analysisPayload))
  // Pending-request markers no longer needed once delivery succeeds.
  const requestId = sessionStorage.getItem("pendingAnalysisRequestId") || undefined
  sessionStorage.removeItem("pendingAnalysisRequestId")
  sessionStorage.removeItem("pendingAnalysisStartedAt")
  const top1 = analysisResults.differentialDiagnoses[0]
  trackEvent("analysis-complete", {
    step: 8,
    analysis: {
      requestId,
      top1Diagnosis: top1?.diagnosis,
      top1Confidence: typeof top1?.confidenceScore === "number" ? top1.confidenceScore : undefined,
    },
  })
  router.push("/results/analysis")
}

/**
 * Resume polling for the persisted analysisResult by requestId. Polls
 * every 5s for up to 12 min from startedAt (pipeline is ~7-8 min typical
 * + buffer). Aborts on AbortController signal. Returns the run record
 * on success, null on timeout / aborted / repeated failures.
 */
async function tryResumeFromKv(
  requestId: string,
  startedAt: number,
  abortRef: React.RefObject<AbortController | null>,
): Promise<{ analysisResult: any } | null> {
  const MAX_AGE_MS = 12 * 60 * 1000
  const POLL_MS = 5000
  while (Date.now() - startedAt < MAX_AGE_MS) {
    if (abortRef.current?.signal.aborted) return null
    try {
      const res = await fetch(`/api/get-analysis/${encodeURIComponent(requestId)}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.status === "complete" && data?.analysisResult) {
          return { analysisResult: data.analysisResult }
        }
      }
      // 404 / pending -> keep polling
    } catch {
      // network blip, keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return null
}

export default function AnalysisPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [pipelineEvents, setPipelineEvents] = useState<PipelineProgress[]>([])
  const [preTriageSymptoms, setPreTriageSymptoms] = useState<Array<{
    originalPhrase: string
    medicalTerm: string
    code: string | null
    codeSystem: 'SNOMED' | 'UMLS CUI' | null
  }>>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    const startAnalysis = async () => {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const step1Data = localStorage.getItem("step1Data")
      const step2Data = localStorage.getItem("step2Data")
      const step3Data = localStorage.getItem("step3Data")
      // step4Data is optional post-consolidation. It used to hold photos;
      // photos now live in step3Data.photos. We still honor a legacy
      // step4Data when present (mid-flow users).
      const step4Data = localStorage.getItem("step4Data")
      const step5Data = localStorage.getItem("step5Data")
      const step6Data = localStorage.getItem("step6Data")

      if (!step1Data || !step2Data || !step3Data || !step5Data || !step6Data) {
        // After the intake renumbering: /step-4 hosts what step5Data
        // saves (review), /step-5 hosts what step6Data saves (consent).
        // localStorage keys retained for backwards-compat with in-flight
        // sessions.
        const missing = !step1Data
          ? "/step-1"
          : !step2Data
            ? "/step-2"
            : !step3Data
              ? "/step-3"
              : !step5Data
                ? "/step-4"
                : "/step-5"
        router.push(missing)
        return
      }

      try {
        const parsedStep1: Step1Data = JSON.parse(step1Data)
        const parsedStep2: Step2Data = JSON.parse(step2Data)
        const parsedStep3: Step3Data = JSON.parse(step3Data)
        // Photos: prefer step3Data.photos (post-consolidation location),
        // fall back to legacy step4Data.photos.
        const legacyStep4: Step4Data | null = step4Data ? JSON.parse(step4Data) : null
        const photos = parsedStep3.photos ?? legacyStep4?.photos ?? []
        const parsedStep5: Step5Data = JSON.parse(step5Data)
        JSON.parse(step6Data) // validate step6 (consents) is present

        // Combined narrative = the written history (step-2) plus any
        // symptom-photo descriptions from step-3. parse-symptoms operates
        // on this combined text so visible findings flow into the symptom
        // list alongside what the patient wrote.
        const combinedNarrative = combineNarrativeAndPhotos(
          parsedStep2.primaryConcern || "",
          photos,
        )

        // ===== STAGE 0: SYMPTOM EXTRACTION =====
        setPipelineEvents([{
          stage: 'extraction',
          stageNumber: 0,
          totalStages: 7,
          percentage: 2,
          detail: 'Parsing symptoms from your narrative...',
          data: { symptomCount: 0, symptoms: [] },
        } as PipelineProgress])
        setProgress(2)

        // Call parse-symptoms API. Uses the combined narrative so any
        // symptom-photo descriptions are part of the same extraction pass
        // as the written history.
        const parseResponse = await fetch("/api/parse-symptoms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: combinedNarrative,
            patientAge: parsedStep1.age,
            patientSex: parsedStep1.biologicalSex,
          }),
        })

        const parseData = await parseResponse.json().catch(() => null)

        if (!parseResponse.ok) {
          const detail = parseData?.error || parseResponse.statusText || `HTTP ${parseResponse.status}`
          throw new Error(`Symptom parsing failed: ${detail}`)
        }

        if (!parseData || parseData.error || !parseData.symptoms?.length) {
          throw new Error(parseData?.error || "No symptoms could be extracted from your description.")
        }

        // Map each parsed symptom to UMLS concepts
        setProgress(5)
        const mappedResults = await Promise.all(
          parseData.symptoms.map((symptom: any) => mapSingleSymptom(symptom))
        )

        // Build pre-triage display data
        const preExtracted = mappedResults.map((s) => {
          const concept = s.selectedConcept || null
          const code = concept?.cui || null
          const codeSystem: 'SNOMED' | 'UMLS CUI' | null = concept?.cui ? 'UMLS CUI' : null
          return {
            originalPhrase: s.originalPhrase,
            medicalTerm: s.medicalTerm,
            code,
            codeSystem,
          }
        }).filter((s) => s.medicalTerm)

        setPreTriageSymptoms(preExtracted)

        // Store mapped symptoms in localStorage for consistency
        localStorage.setItem("mappedSymptoms", JSON.stringify(mappedResults))

        // Emit extraction-complete event
        setPipelineEvents([{
          stage: 'extraction-complete',
          stageNumber: 0,
          totalStages: 7,
          percentage: 10,
          detail: `Extracted ${preExtracted.length} symptoms with UMLS mappings`,
          data: { symptomCount: preExtracted.length, symptoms: preExtracted },
        } as PipelineProgress])
        setProgress(10)

        // Build symptoms array for pipeline payload
        const symptoms = mappedResults.map((s) => ({
          originalPhrase: s.originalPhrase,
          originalText: s.originalPhrase,
          text: s.originalPhrase,
          medicalTerm: s.medicalTerm,
          selectedConcept: s.selectedConcept,
          category: s.category,
          bodyPart: s.bodyPart,
          severity: s.severity,
        }))

        // Labs are now collected on step-3 (was: step-2 in the legacy flow).
        // Tolerate legacy step2Data.labResults so drafts started before the
        // restructure still submit cleanly.
        const labResults = Array.isArray(parsedStep3.labResults) && parsedStep3.labResults.length > 0
          ? parsedStep3.labResults
          : (Array.isArray(parsedStep2.labResults) ? parsedStep2.labResults : [])

        const analysisPayload = {
          demographics: {
            age: parsedStep1.age,
            sex: parsedStep1.biologicalSex,
          },
          chiefComplaint: {
            // Use the combined narrative so the pipeline sees the same text
            // we parsed symptoms from. Includes photo descriptions.
            description: combinedNarrative,
            // Timeline + severity now live on step-2 (history). Fall back
            // to step-5 for drafts that crossed the migration boundary.
            duration:
              parsedStep2.mainSymptomStart ||
              parsedStep5.mainSymptomStart ||
              undefined,
            bodyRegions: [],
            severity:
              parsedStep2.severity ?? parsedStep5.severity ?? 5,
          },
          symptoms,
          // parse-symptoms now returns excludedFindings as full objects; map
          // each to a clinical term string for the pipeline. Tolerate legacy
          // string entries for backward compatibility.
          excludedFindings: Array.isArray(parseData.excludedFindings)
            ? parseData.excludedFindings
                .map((e: any) => {
                  if (typeof e === "string") return e.trim()
                  if (e && typeof e === "object") return (e.medicalTerm || e.originalPhrase || "").toString().trim()
                  return ""
                })
                .filter((s: string) => s.length > 0)
            : [],
          labResults,
          // patient-theory question was removed from the form; legacy drafts
          // that filled it before the removal still surface through to the
          // pipeline so we don't drop their input.
          patientHypothesis: parsedStep2.noIdea ? null : parsedStep2.patientHypothesis || null,
          medicalHistory: {
            currentMedications: [],
            pastMedicalHistory: [],
            familyHistory: [],
            recentTests: [],
            medicalCare: "",
            testingHistory: [],
          },
          familyHistory: [],
          symptomPatterns: null,
        }

        const startTime = Date.now()

        // Persist the patient case upfront so the resume-from-KV path
        // can reuse it if the SSE connection dies (e.g., mobile suspend).
        // The analysisRequestId + startedAt are saved as soon as the first
        // SSE event arrives (every event carries the requestId).
        sessionStorage.setItem("analysisPatientCase", JSON.stringify(analysisPayload))
        sessionStorage.setItem("pendingAnalysisStartedAt", String(startTime))

        // BEFORE making the request — check if we have a recent pending
        // analysis from a prior tab visit that died mid-flight (mobile
        // suspended, user closed and reopened, etc.). If so, try the
        // resume path instead of starting a duplicate analysis.
        const priorRequestId = sessionStorage.getItem("pendingAnalysisRequestId")
        const priorStartedAt = parseInt(
          sessionStorage.getItem("pendingAnalysisStartedAt") || "0",
          10,
        )
        if (priorRequestId && priorStartedAt && Date.now() - priorStartedAt < 12 * 60 * 1000) {
          const resumed = await tryResumeFromKv(priorRequestId, priorStartedAt, abortControllerRef)
          if (resumed && !abortControllerRef.current?.signal.aborted) {
            handleAnalysisResult(
              resumed.analysisResult,
              priorStartedAt,
              parsedStep1,
              parsedStep2,
              analysisPayload,
              router,
            )
            return
          }
          // Resume failed or timed out — fall through to a fresh analysis.
          // Clear stale markers so the next run starts clean.
          sessionStorage.removeItem("pendingAnalysisRequestId")
        }

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        const response = await fetch("/api/analyze-patient-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analysisPayload),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorBody = await response.text()
          let errorMessage = `Analysis failed: ${response.statusText}`
          try {
            const parsed = JSON.parse(errorBody)
            if (parsed.error) errorMessage = parsed.error
            if (parsed.retryAfter) errorMessage += ` (retry in ${parsed.retryAfter}s)`
          } catch {
            // keep default
          }
          throw new Error(errorMessage)
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n\n")
          buffer = lines.pop() || ""

          for (const chunk of lines) {
            const dataLine = chunk.trim()
            if (!dataLine.startsWith("data: ")) continue

            const jsonStr = dataLine.slice(6)
            let event: any
            try {
              event = JSON.parse(jsonStr)
            } catch {
              continue
            }

            // Every SSE event carries the requestId — capture and persist
            // it the first time we see it so the resume-from-KV path can
            // poll for the result if the connection later dies.
            if (event.requestId && !sessionStorage.getItem("pendingAnalysisRequestId")) {
              sessionStorage.setItem("pendingAnalysisRequestId", event.requestId)
            }

            if (event.type === "progress") {
              const progressEvent: PipelineProgress = {
                stage: event.stage,
                stageNumber: event.stageNumber,
                totalStages: event.totalStages,
                percentage: event.percentage,
                detail: event.detail,
                data: event.data,
              } as PipelineProgress

              setPipelineEvents((prev) => [...prev, progressEvent])
              setProgress(event.percentage)
            } else if (event.type === "result") {
              if (!event.success || !event.analysis) {
                throw new Error("Invalid analysis result from pipeline")
              }
              handleAnalysisResult(
                event.analysis,
                startTime,
                parsedStep1,
                parsedStep2,
                analysisPayload,
                router,
              )
              return
            } else if (event.type === "error") {
              throw new Error(event.error || "Pipeline error")
            }
          }
        }

        throw new Error("Analysis stream ended without a result")
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return

        // Before showing "Analysis failed" — the SSE may have died
        // because mobile suspended the tab while the pipeline kept
        // running server-side. Check whether KV has the result.
        const pendingId = sessionStorage.getItem("pendingAnalysisRequestId")
        const pendingAt = parseInt(
          sessionStorage.getItem("pendingAnalysisStartedAt") || "0",
          10,
        )
        if (pendingId && pendingAt && Date.now() - pendingAt < 12 * 60 * 1000) {
          setPipelineEvents((prev) => [
            ...prev,
            {
              stage: "heartbeat",
              stageNumber: 0,
              totalStages: 7,
              percentage: Math.max(0, Math.min(95, Math.round(((Date.now() - pendingAt) / (10 * 60_000)) * 100))),
              detail: "Reconnecting — checking whether your analysis completed in the background…",
              data: null,
            } as any,
          ])
          const resumed = await tryResumeFromKv(pendingId, pendingAt, abortControllerRef)
          if (resumed && !abortControllerRef.current?.signal.aborted) {
            handleAnalysisResult(
              resumed.analysisResult,
              pendingAt,
              JSON.parse(localStorage.getItem("step1Data") || "{}"),
              JSON.parse(localStorage.getItem("step2Data") || "{}"),
              JSON.parse(sessionStorage.getItem("analysisPatientCase") || "{}"),
              router,
            )
            return
          }
        }

        setError(err instanceof Error ? err.message : "Analysis failed")
        setProgress(0)
      }
    }

    startAnalysis()

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [router])

  if (error) {
    // Translate internal pipeline tags to friendly user-facing copy. The
    // raw error names a specific stage (e.g. "synthesizer.bad_output",
    // "Anthropic API error 529"); the user gets a clear next-step
    // instead. The internal id stays visible as a tiny error code so
    // support can correlate logs.
    const friendly = (() => {
      const m = (error || "").toLowerCase()
      if (m.includes("synthesizer.bad_output") || m.includes("evaluator.bad_output") || m.includes("finalizer.bad_output")) {
        return {
          headline: "We hit a snag in the diagnostic synthesis",
          detail:
            "Our reasoning model returned a response we couldn't parse. This happens occasionally with complex cases. Your information is still in your browser — just click Start Over to try again. If it keeps failing, please share what you entered (or a few words about it) so we can debug.",
          code: "SYNTH_NONCONFORM",
        }
      }
      if (m.includes("anthropic api error 5") || m.includes("openai") || m.includes("503") || m.includes("overload")) {
        return {
          headline: "An AI model was temporarily unavailable",
          detail:
            "One of the language models the pipeline calls is overloaded right now. Wait a minute and try again — your input is still saved in your browser.",
          code: "UPSTREAM_OVERLOAD",
        }
      }
      if (m.includes("timeout") || m.includes("aborted")) {
        return {
          headline: "Analysis timed out",
          detail:
            "The pipeline took longer than expected and we had to stop it. This happens on cases with very long histories or transient slowdowns. Try again — most retries succeed.",
          code: "TIMEOUT",
        }
      }
      if (m.includes("at least one symptom") || m.includes("symptoms:")) {
        return {
          headline: "We couldn't extract any symptoms",
          detail:
            "The symptom-parsing step couldn't identify clinical findings in your description. Click Start Over and try rephrasing with specific symptoms (e.g., \"chronic fatigue, joint pain since 2019\").",
          code: "NO_SYMPTOMS",
        }
      }
      if (m.includes("budget") || m.includes("cost")) {
        return {
          headline: "This analysis hit the cost cap",
          detail:
            "We cap the per-analysis spend during beta. Your case may be unusually complex. Try simplifying the description or splitting it into two analyses.",
          code: "BUDGET_CAP",
        }
      }
      return {
        headline: "Analysis didn't complete",
        detail:
          "Something went wrong while processing your case. Your information is still in your browser — click Start Over to try again. If it keeps failing, the issue may be on our side; please try again later.",
        code: "GENERIC",
      }
    })()

    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl font-semibold mb-4">{friendly.headline}</div>
          <p className="text-gray-700 mb-6 leading-relaxed">{friendly.detail}</p>
          <button
            onClick={() => router.push("/step-2")}
            className="px-6 py-3 bg-[#8b2500] text-white rounded-none hover:bg-[#6d1d00] transition-colors"
          >
            Edit your story & retry
          </button>
          <div className="mt-4 flex flex-col items-center gap-1 text-[10px] text-gray-400">
            <span>Error code: {friendly.code}</span>
            <span className="font-mono break-all max-w-xs">{error.slice(0, 200)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <TestUserGroundTruthBanner />
      <AnalysisLoading progress={progress} pipelineEvents={pipelineEvents} preTriageSymptoms={preTriageSymptoms} />
    </>
  )
}
