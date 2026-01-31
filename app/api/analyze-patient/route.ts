import { type NextRequest, NextResponse } from "next/server"

// Generate unique request ID for tracking
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Simplified logging function
function logAnalysis(requestId: string, level: "INFO" | "ERROR", message: string, data?: any) {
  const timestamp = new Date().toISOString()

  if (level === "ERROR") {
    console.error(`[${timestamp}] [ANALYZE-PATIENT] [${requestId}] ERROR: ${message}`, data || "")
  } else {
    console.log(`[${timestamp}] [ANALYZE-PATIENT] [${requestId}] ${message}`, data || "")
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    logAnalysis(requestId, "INFO", "=== ANALYSIS REQUEST START ===")

    // Check OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logAnalysis(requestId, "ERROR", "Missing OPENAI_API_KEY environment variable")
      return NextResponse.json(
        {
          error: "AI service not available",
          details: "OpenAI API key not configured",
          requestId,
        },
        { status: 500 },
      )
    }

    // Parse request body with detailed error handling
    let patientData
    let requestBody = ""
    try {
      requestBody = await request.text()
      logAnalysis(requestId, "INFO", "Raw request body received", {
        bodyLength: requestBody.length,
        bodyPreview: requestBody.substring(0, 200) + "...",
      })

      patientData = JSON.parse(requestBody)
      logAnalysis(requestId, "INFO", "Request body parsed successfully")
    } catch (parseError: any) {
      logAnalysis(requestId, "ERROR", "Failed to parse request body", {
        error: parseError.message,
        bodyLength: requestBody.length,
        bodyPreview: requestBody.substring(0, 100),
      })
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          details: parseError.message,
          requestId,
        },
        { status: 400 },
      )
    }

    logAnalysis(requestId, "INFO", "Request data received", {
      hasDemo: !!patientData.demographics,
      hasChiefComplaint: !!patientData.chiefComplaint,
      symptomsCount: patientData.symptoms?.length || 0,
      hasPatientHypothesis: !!patientData.patientHypothesis,
      requestBodySize: requestBody.length,
      dataKeys: Object.keys(patientData),
    })

    // Validate required fields with detailed logging
    const requiredFields = ["demographics", "chiefComplaint", "symptoms"]
    const missingFields = []

    for (const field of requiredFields) {
      if (!patientData[field]) {
        missingFields.push(field)
        logAnalysis(requestId, "ERROR", `Missing required field: ${field}`)
      }
    }

    if (missingFields.length > 0) {
      logAnalysis(requestId, "ERROR", "Missing required fields", {
        missingFields,
        providedFields: Object.keys(patientData),
      })
      return NextResponse.json(
        {
          error: `Missing required fields: ${missingFields.join(", ")}`,
          requestId,
          providedFields: Object.keys(patientData),
        },
        { status: 400 },
      )
    }

    // Additional validation with detailed logging
    if (!patientData.demographics?.age || !patientData.demographics?.sex) {
      logAnalysis(requestId, "ERROR", "Incomplete demographics", {
        demographics: patientData.demographics,
        hasAge: !!patientData.demographics?.age,
        hasSex: !!patientData.demographics?.sex,
      })
      return NextResponse.json(
        {
          error: "Demographics must include age and sex",
          requestId,
          received: patientData.demographics,
        },
        { status: 400 },
      )
    }

    if (!patientData.chiefComplaint?.description) {
      logAnalysis(requestId, "ERROR", "Missing chief complaint description", {
        chiefComplaint: patientData.chiefComplaint,
        hasDescription: !!patientData.chiefComplaint?.description,
      })
      return NextResponse.json(
        {
          error: "Chief complaint must include description",
          requestId,
          received: patientData.chiefComplaint,
        },
        { status: 400 },
      )
    }

    logAnalysis(requestId, "INFO", "Validation passed - preparing OpenAI request", {
      age: patientData.demographics.age,
      sex: patientData.demographics.sex,
      chiefComplaintLength: patientData.chiefComplaint.description?.length || 0,
      symptomsCount: patientData.symptoms.length,
      symptomsDetail: patientData.symptoms.map((s: any) => ({
        originalText: s.originalText || s.originalPhrase,
        medicalTerm: s.medicalTerm || s.selectedConcept?.name,
        hasMapping: !!(s.selectedConcept || s.medicalTerm),
      })),
    })

    const systemPrompt = `You are Dr. Expert, a world-renowned specialist in rare and complex diseases with 30+ years of experience in diagnostic medicine. Your expertise spans:

- Rare genetic disorders and inherited diseases
- Complex autoimmune and inflammatory conditions  
- Unusual presentations of known diseases
- Metabolic and endocrine disorders
- Neurological conditions with atypical presentations
- Multi-system diseases that puzzle other doctors

CRITICAL INSTRUCTIONS:
1. You specialize in CONDITIONS THAT ARE MISSED OR MISDIAGNOSED by typical primary care doctors
2. EXCLUDE common, obvious diagnoses that any general practitioner would consider
3. Focus on rare diseases, genetic conditions, autoimmune disorders, and complex presentations
4. Consider conditions with prevalence <1 in 10,000 or those requiring specialized testing
5. Think about conditions that present with common symptoms but have rare underlying causes
6. Consider genetic syndromes, metabolic disorders, and systemic diseases

DIAGNOSTIC APPROACH:
- Consider the patient's age, sex, and family history in context of rare diseases
- Look for patterns suggesting systemic, genetic, or autoimmune conditions
- Think about conditions that could explain multiple seemingly unrelated symptoms
- Consider rare causes of common symptom complexes
- Focus on conditions requiring specialized testing or expert evaluation

OUTPUT REQUIREMENTS:
Return exactly 5 differential diagnoses ranked by likelihood, plus excluded common conditions.
For each diagnosis, provide confidence score (0-100), clinical reasoning, supporting evidence, and next steps. Please factor in lack of evidence and data and other gaps when calculating confidence score and do not overstate your confidence score.
Also identify data gaps and recommended testing.`

    const userPrompt = `PATIENT PRESENTATION:

Demographics: Age ${patientData.demographics.age}, ${patientData.demographics.sex}

Chief Complaint: "${patientData.chiefComplaint.description}"
Duration: ${patientData.chiefComplaint.duration || "unknown"}
Severity: ${patientData.chiefComplaint.severity || "unknown"}/10

Symptoms Identified:
${patientData.symptoms.map((s: any) => `- ${s.originalText || s.originalPhrase} (Medical term: ${s.selectedConcept?.name || s.medicalTerm || "Not mapped"})`).join("\n")}

${patientData.patientHypothesis ? `Patient's Initial Thought: "${patientData.patientHypothesis}"` : ""}

${patientData.medicalHistory ? `Medical History: ${JSON.stringify(patientData.medicalHistory)}` : ""}

${patientData.familyHistory ? `Family History: ${patientData.familyHistory}` : ""}

TASK: Provide expert rare disease differential diagnosis analysis.`

    logAnalysis(requestId, "INFO", "Sending request to OpenAI", {
      model: "gpt-4-turbo-preview",
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      temperature: 0.2,
      hasApiKey: !!openaiApiKey,
    })

    const openaiStartTime = Date.now()

    let response
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_rare_disease_analysis",
                description: "Generate comprehensive rare disease differential diagnosis",
                parameters: {
                  type: "object",
                  properties: {
                    differentialDiagnoses: {
                      type: "array",
                      minItems: 5,
                      maxItems: 5,
                      items: {
                        type: "object",
                        properties: {
                          diagnosis: { type: "string", description: "Name of the condition" },
                          icd10Code: { type: "string", description: "ICD-10 code if available" },
                          confidenceScore: { type: "number", minimum: 0, maximum: 100 },
                          rareDisease: { type: "boolean", description: "True if rare disease (prevalence <1 in 10,000)" },
                          prevalence: { type: "string", description: "Estimated prevalence (e.g., '1 in 50,000')" },
                          supportingEvidence: {
                            type: "array",
                            items: { type: "string" },
                            description: "Patient symptoms/findings that support this diagnosis",
                          },
                          contradictoryEvidence: {
                            type: "array",
                            items: { type: "string" },
                            description: "Findings that argue against this diagnosis",
                          },
                          clinicalReasoning: { type: "string", description: "Detailed medical reasoning" },
                          typicalPresentation: { type: "string", description: "How this condition typically presents" },
                          specialistRequired: { type: "string", description: "Type of specialist needed for diagnosis" },
                          diagnosticCriteria: { type: "string", description: "Key diagnostic criteria or tests" },
                        },
                        required: ["diagnosis", "confidenceScore", "clinicalReasoning"]
                      },
                    },
                    excludedCommonDiagnoses: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          diagnosis: { type: "string" },
                          reasonExcluded: { type: "string" },
                        },
                        required: ["diagnosis", "reasonExcluded"]
                      },
                      description: "Common conditions deliberately excluded from consideration",
                    },
                    dataGaps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          gapType: {
                            type: "string",
                            enum: [
                              "laboratory",
                              "imaging",
                              "genetic_testing",
                              "specialist_evaluation",
                              "family_history",
                              "functional_assessment",
                            ],
                          },
                          description: { type: "string" },
                          priority: { type: "string", enum: ["high", "medium", "low"] },
                          estimatedImpact: { type: "string" },
                        },
                        required: ["gapType", "description", "priority"]
                      },
                    },
                    recommendedTesting: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          testType: { type: "string" },
                          testName: { type: "string" },
                          rationale: { type: "string" },
                          urgency: { type: "string", enum: ["urgent", "routine", "when_available"] },
                        },
                        required: ["testType", "testName", "rationale"]
                      },
                    },
                    nextSteps: {
                      type: "object",
                      properties: {
                        immediateActions: { type: "array", items: { type: "string" } },
                        specialistReferrals: { type: "array", items: { type: "string" } },
                        followUpTiming: { type: "string" },
                        redFlags: { type: "array", items: { type: "string" } },
                      },
                      required: ["immediateActions", "specialistReferrals", "followUpTiming"]
                    },
                    overallAssessment: {
                      type: "string",
                      description: "Summary of clinical picture and diagnostic uncertainty",
                    },
                    patientHypothesisAnalysis: {
                      type: "object",
                      properties: {
                        likelihood: { type: "number", minimum: 0, maximum: 100 },
                        reasoning: { type: "string" },
                        alternativeExplanation: { type: "string" },
                      },
                      description: "Analysis of patient's initial hypothesis if provided",
                    },
                  },
                  required: [
                    "differentialDiagnoses",
                    "excludedCommonDiagnoses",
                    "dataGaps",
                    "recommendedTesting",
                    "nextSteps",
                    "overallAssessment",
                  ],
                },
              }
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_rare_disease_analysis" } },
          temperature: 0.2,
        }),
      })
    } catch (fetchError: any) {
      const openaiResponseTime = Date.now() - openaiStartTime
      logAnalysis(requestId, "ERROR", "OpenAI fetch failed", {
        error: fetchError.message,
        errorType: fetchError.constructor.name,
        openaiResponseTime,
      })

      return NextResponse.json(
        {
          error: "AI analysis service temporarily unavailable",
          details: process.env.NODE_ENV === "development" ? fetchError.message : undefined,
          requestId,
          processingTime: Date.now() - startTime,
        },
        { status: 503 },
      )
    }

    const openaiResponseTime = Date.now() - openaiStartTime

    logAnalysis(requestId, "INFO", "OpenAI response received", {
      openaiTime: openaiResponseTime,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logAnalysis(requestId, "ERROR", "OpenAI API error response", {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
      })

      return NextResponse.json(
        {
          error: "AI analysis service temporarily unavailable",
          details: process.env.NODE_ENV === "development" ? `OpenAI API error: ${response.status}` : undefined,
          requestId,
          processingTime: Date.now() - startTime,
        },
        { status: 503 },
      )
    }

    const completion = await response.json()
    const totalResponseTime = Date.now() - startTime

    logAnalysis(requestId, "INFO", "OpenAI response parsed", {
      openaiTime: openaiResponseTime,
      totalTime: totalResponseTime,
      usage: completion.usage,
      finishReason: completion.choices[0]?.finish_reason,
      choicesCount: completion.choices?.length || 0,
    })

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall || !toolCall.function?.arguments) {
      logAnalysis(requestId, "ERROR", "No tool call in OpenAI response", {
        choice: completion.choices[0],
        messageRole: completion.choices[0]?.message?.role,
        messageContent: completion.choices[0]?.message?.content?.substring(0, 200),
        toolCalls: completion.choices[0]?.message?.tool_calls,
      })

      return NextResponse.json(
        {
          error: "Invalid AI response format",
          details: "No tool call received from AI",
          requestId,
          processingTime: totalResponseTime,
        },
        { status: 502 },
      )
    }

    let analysisResult
    try {
      analysisResult = JSON.parse(toolCall.function.arguments)
      logAnalysis(requestId, "INFO", "Successfully parsed tool call arguments", {
        diagnosesCount: analysisResult.differentialDiagnoses?.length || 0,
        excludedCount: analysisResult.excludedCommonDiagnoses?.length || 0,
        dataGapsCount: analysisResult.dataGaps?.length || 0,
        testsCount: analysisResult.recommendedTesting?.length || 0,
        hasOverallAssessment: !!analysisResult.overallAssessment,
        argumentsLength: toolCall.function.arguments.length,
      })
    } catch (parseError: any) {
      logAnalysis(requestId, "ERROR", "Failed to parse OpenAI tool call arguments", {
        error: parseError.message,
        rawArguments: toolCall.function.arguments?.substring(0, 500),
        functionName: toolCall.function.name,
      })

      return NextResponse.json(
        {
          error: "Failed to process AI analysis results",
          details: process.env.NODE_ENV === "development" ? parseError.message : undefined,
          requestId,
          processingTime: totalResponseTime,
        },
        { status: 502 },
      )
    }

    // Add defaults for missing fields to make the analysis more robust
    const safeAnalysisResult = {
      differentialDiagnoses: analysisResult.differentialDiagnoses || [],
      excludedCommonDiagnoses: analysisResult.excludedCommonDiagnoses || [],
      dataGaps: analysisResult.dataGaps || [],
      recommendedTesting: analysisResult.recommendedTesting || [],
      nextSteps: analysisResult.nextSteps || {
        immediateActions: [],
        specialistReferrals: [],
        followUpTiming: "Follow up as needed",
        redFlags: [],
      },
      overallAssessment: analysisResult.overallAssessment || "Analysis completed. Please review the differential diagnoses and recommended next steps.",
      patientHypothesisAnalysis: analysisResult.patientHypothesisAnalysis || null,
    }

    // Comprehensive validation with better error handling
    const validationErrors = []
    const criticalErrors = []

    if (!safeAnalysisResult.differentialDiagnoses || !Array.isArray(safeAnalysisResult.differentialDiagnoses)) {
      criticalErrors.push("Missing or invalid differentialDiagnoses array")
    } else if (safeAnalysisResult.differentialDiagnoses.length === 0) {
      criticalErrors.push("No differential diagnoses provided")
    } else if (safeAnalysisResult.differentialDiagnoses.length < 3) {
      validationErrors.push(`Only ${safeAnalysisResult.differentialDiagnoses.length} differential diagnoses provided (expected 5)`)
    }

    if (!safeAnalysisResult.excludedCommonDiagnoses || !Array.isArray(safeAnalysisResult.excludedCommonDiagnoses)) {
      validationErrors.push("Missing or invalid excludedCommonDiagnoses array")
    }

    // Log all validation results
    logAnalysis(requestId, "INFO", "Analysis validation results", {
      validationErrors,
      criticalErrors,
      resultKeys: Object.keys(analysisResult),
      safeResultKeys: Object.keys(safeAnalysisResult),
      diagnosesCount: safeAnalysisResult.differentialDiagnoses.length,
      hasOverallAssessment: !!safeAnalysisResult.overallAssessment,
      diagnosesStructure: safeAnalysisResult.differentialDiagnoses?.map((d: any, i: number) => ({
        index: i,
        hasName: !!d.diagnosis,
        hasConfidence: typeof d.confidenceScore === "number",
        hasEvidence: Array.isArray(d.supportingEvidence),
        keys: Object.keys(d),
      })),
    })

    // Only fail on critical errors
    if (criticalErrors.length > 0) {
      logAnalysis(requestId, "ERROR", "Critical analysis validation failed", {
        criticalErrors,
        validationErrors,
        resultKeys: Object.keys(analysisResult),
      })

      return NextResponse.json(
        {
          error: "Critical analysis validation failed",
          details: criticalErrors.join(", "),
          requestId,
          processingTime: totalResponseTime,
        },
        { status: 502 },
      )
    }

    // Log warnings for non-critical issues but continue
    if (validationErrors.length > 0) {
      logAnalysis(requestId, "INFO", "Analysis validation warnings (non-critical)", {
        validationErrors,
      })
    }

    // Use the safe analysis result
    analysisResult = safeAnalysisResult

    logAnalysis(requestId, "INFO", "=== ANALYSIS COMPLETE ===", {
      success: true,
      totalTime: totalResponseTime,
      diagnosesCount: analysisResult.differentialDiagnoses.length,
      avgConfidence: Math.round(
        analysisResult.differentialDiagnoses.reduce((sum: number, d: any) => sum + (d.confidenceScore || 0), 0) /
          analysisResult.differentialDiagnoses.length,
      ),
      topDiagnosis: analysisResult.differentialDiagnoses[0]?.diagnosis,
      topConfidence: analysisResult.differentialDiagnoses[0]?.confidenceScore,
    })

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
      timestamp: new Date().toISOString(),
      processingTime: totalResponseTime,
      requestId: requestId,
      metadata: {
        openaiResponseTime: openaiResponseTime,
        totalProcessingTime: totalResponseTime,
        usage: completion.usage,
      },
    })
  } catch (error: any) {
    const totalResponseTime = Date.now() - startTime

    logAnalysis(requestId, "ERROR", "Unexpected error in analysis request", {
      error: {
        name: error.constructor.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 5),
      },
      totalTime: totalResponseTime,
    })

    return NextResponse.json(
      {
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
        timestamp: new Date().toISOString(),
        requestId: requestId,
        processingTime: totalResponseTime,
      },
      { status: 500 },
    )
  }
}
