import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { searchTerm } = await request.json()

    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json({ error: "Search term too short" }, { status: 400 })
    }

    const umlsApiKey = process.env.UMLS_API_KEY
    if (!umlsApiKey) {
      return NextResponse.json({ error: "UMLS API key not configured" }, { status: 500 })
    }

    // Step 1: Get TGT (Ticket Granting Ticket)
    const tgtResponse = await fetch("https://utslogin.nlm.nih.gov/cas/v1/api-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `apikey=${encodeURIComponent(umlsApiKey)}`,
    })

    if (!tgtResponse.ok) {
      console.error(`UMLS TGT response status: ${tgtResponse.status}`)
      throw new Error(`UMLS TGT authentication failed: ${tgtResponse.status}`)
    }

    const tgtData = await tgtResponse.text()
    console.log("UMLS TGT response:", tgtData.substring(0, 200))

    // Extract TGT from response
    const tgtMatch = tgtData.match(/TGT-[\w-]+/)
    if (!tgtMatch) {
      console.error("Failed to extract TGT from response:", tgtData)
      throw new Error("Failed to extract TGT from UMLS response")
    }

    const tgt = tgtMatch[0]
    console.log("Extracted TGT:", tgt.substring(0, 20) + "...")

    // Step 2: Exchange TGT for Service Ticket (ST)
    const serviceUrl = "http://umlsks.nlm.nih.gov"
    const stResponse = await fetch(`https://utslogin.nlm.nih.gov/cas/v1/tickets/${tgt}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `service=${encodeURIComponent(serviceUrl)}`,
    })

    if (!stResponse.ok) {
      console.error(`Service ticket exchange failed: ${stResponse.status}`)
      const errorText = await stResponse.text()
      console.error(`ST error response: ${errorText}`)
      throw new Error(`Service ticket exchange failed: ${stResponse.status}`)
    }

    const serviceTicket = await stResponse.text().then(text => text.trim())
    console.log("Got service ticket:", serviceTicket.substring(0, 20) + "...")

    // Step 3: Search UMLS with the service ticket
    const searchParams = new URLSearchParams({
      string: searchTerm,
      sabs: 'SNOMEDCT_US',
      returnIdType: 'concept',
      pageSize: '3',
      ticket: serviceTicket
    })

    const searchUrl = `https://uts-ws.nlm.nih.gov/rest/search/current?${searchParams.toString()}`
    console.log("UMLS search URL:", searchUrl.replace(serviceTicket, "TICKET_HIDDEN"))

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error(`UMLS search failed: ${searchResponse.status} - ${errorText}`)
      
      // Try alternative approach if 401
      if (searchResponse.status === 401) {
        console.log("Trying alternative authentication approach...")
        
        const altServiceUrl = "https://uts-ws.nlm.nih.gov"
        const altStResponse = await fetch(`https://utslogin.nlm.nih.gov/cas/v1/tickets/${tgt}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `service=${encodeURIComponent(altServiceUrl)}`,
        })

        if (altStResponse.ok) {
          const altServiceTicket = await altStResponse.text().then(text => text.trim())
          console.log("Got alternative service ticket:", altServiceTicket.substring(0, 20) + "...")
          
          const altSearchParams = new URLSearchParams({
            string: searchTerm,
            sabs: 'SNOMEDCT_US',
            returnIdType: 'concept',
            pageSize: '3',
            ticket: altServiceTicket
          })

          const altSearchUrl = `https://uts-ws.nlm.nih.gov/rest/search/current?${altSearchParams.toString()}`
          
          const altSearchResponse = await fetch(altSearchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            },
          })

          if (altSearchResponse.ok) {
            const searchData = await altSearchResponse.json()
            return processSearchResults(searchData, searchTerm)
          }
        }
      }
      
      throw new Error(`UMLS search failed: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    return processSearchResults(searchData, searchTerm)

  } catch (error: any) {
    console.error("UMLS search error:", error)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        concepts: [],
        confidence: 0,
        searchTerm: searchTerm
      },
      { status: 500 }
    )
  }
}

function processSearchResults(searchData: any, searchTerm: string) {
  console.log("UMLS search results count:", searchData.result?.results?.length || 0)
  
  const results = searchData.result?.results || []

  if (results.length === 0) {
    console.log("No UMLS results found for:", searchTerm)
    return NextResponse.json({
      concepts: [],
      confidence: 0,
      searchTerm: searchTerm
    })
  }

  // Log first result for debugging
  console.log("First UMLS result:", JSON.stringify(results[0], null, 2))

  // Process results into our format
  const concepts = results.slice(0, 3).map((result: any) => ({
    cui: result.ui,
    name: result.name,
    semanticType: result.semanticType?.[0] || 'Unknown',
    score: parseFloat(result.score || '0'),
    snomedCode: result.rootSource === 'SNOMEDCT_US' ? result.ui : null
  }))

  console.log("Processed concepts:", JSON.stringify(concepts, null, 2))

  // UMLS RANKING-BASED CONFIDENCE CALCULATION
  let confidence = 0
  if (concepts.length > 0) {
    const bestMatch = concepts[0]
    const searchTermLower = searchTerm.toLowerCase().trim()
    const matchNameLower = bestMatch.name.toLowerCase().trim()
    
    console.log(`Confidence calc inputs: searchTerm="${searchTermLower}", bestMatch="${matchNameLower}"`)
    
    // 1. EXACT TEXT MATCH (Highest confidence)
    if (matchNameLower === searchTermLower) {
      confidence = 0.95
      console.log("Exact text match detected - confidence: 0.95")
    }
    // 2. TEXT CONTAINMENT (High confidence)
    else if (matchNameLower.includes(searchTermLower) || searchTermLower.includes(matchNameLower)) {
      confidence = 0.85
      console.log("Text containment match - confidence: 0.85")
    }
    // 3. TRUST UMLS RANKING (The key improvement)
    else {
      // UMLS returned this as the #1 result, so it's likely medically relevant
      // Base confidence on result position
      confidence = 0.80  // High confidence for #1 UMLS result
      
      console.log("UMLS ranking-based confidence (1st result) - confidence: 0.80")
      
      // Optional: Add small boost for word overlap to differentiate quality
      const searchWords = searchTermLower.split(/\s+/).filter(w => w.length > 2)
      const matchWords = matchNameLower.split(/\s+/).filter(w => w.length > 2)
      
      let hasWordOverlap = false
      searchWords.forEach(searchWord => {
        matchWords.forEach(matchWord => {
          if (searchWord.includes(matchWord) || matchWord.includes(searchWord)) {
            hasWordOverlap = true
          }
        })
      })
      
      if (hasWordOverlap) {
        confidence = 0.85
        console.log("UMLS ranking + word overlap boost - confidence: 0.85")
      }
    }
    
    // Small boost for multiple good results
    if (concepts.length > 1 && confidence >= 0.80) {
      confidence = Math.min(0.95, confidence + 0.02)
      console.log(`Multiple results boost - final confidence: ${confidence}`)
    }
    
    // Ensure reasonable bounds
    confidence = Math.max(0.50, Math.min(0.95, confidence))
  }

  console.log(`Final confidence for "${searchTerm}" -> "${concepts[0]?.name}": ${confidence}`)

  return NextResponse.json({
    concepts: concepts,
    confidence: confidence,
    searchTerm: searchTerm
  })
}
