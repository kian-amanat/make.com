// app/api/verify/search-tools/route.js
let seenCompanies = new Set();

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = (body?.query || "").trim();
    const reset = !!body?.reset;

    if (reset) {
      seenCompanies.clear();
      return new Response(JSON.stringify({ message: "History reset." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!query) {
      return new Response(JSON.stringify({ error: "No query provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY. Set it in your environment.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    function extractTextFromResponse(resp) {
      if (!resp || !Array.isArray(resp.output)) return "";
      const messageItem =
        resp.output.find((o) => o.type === "message") ||
        resp.output[resp.output.length - 1];
      const contents = messageItem?.content || [];
      const texts = [];
      for (const c of contents) {
        if (!c) continue;
        if (typeof c === "string") texts.push(c);
        else if (c.text) texts.push(c.text);
        else if (c.delta?.content) texts.push(c.delta.content);
      }
      return texts.join("\n").trim();
    }

    function extractJSON(str) {
      try {
        const m = str.match(/\[[\s\S]*\]/);
        if (!m) return [];
        return JSON.parse(m[0]);
      } catch {
        return [];
      }
    }

    // ---------- Step 1: ask OpenAI for one company ----------
    const companyPrompt = `
You are a company searcher.
Task: return exactly 1 real company that focuses on "${query}".
Do NOT return companies already seen: ${
      Array.from(seenCompanies).join(", ") || "(none)"
    }.

Return JSON only:
[
  { "name": "Company 1" }
]`.trim();

    const companyRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: companyPrompt,
        temperature: 0,
        max_output_tokens: 500,
      }),
    });

    if (!companyRes.ok) {
      const txt = await companyRes.text().catch(() => "");
      console.error("OpenAI company step error:", companyRes.status, txt);
      return new Response(
        JSON.stringify({
          error: `OpenAI company step failed: ${txt || companyRes.status}`,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const companyJson = await companyRes.json().catch(() => null);
    const companyRawText = extractTextFromResponse(companyJson);
    const companyList = extractJSON(companyRawText);

    if (!Array.isArray(companyList) || companyList.length === 0) {
      return new Response(
        JSON.stringify({ error: "No new companies found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const company = companyList[0];
    seenCompanies.add(company.name);

    // ---------- Step 2: render HTML ----------
    const renderPrompt = `
You are a frontend generator.

Input:
${JSON.stringify([company], null, 2)}

For each company produce one HTML card using this EXACT template (raw HTML only, no surrounding JSON or commentary).
Each link must appear on its own line: make every <a> element use style="display:block" (do not use <br>).
If you know a URL, put it in href. If unknown, set href="".
Always include ALL five social anchors (Website, X, LinkedIn, YouTube, Email) and Contact and Reviews anchors (even when empty).

Exact template to produce (replace tokens appropriately for each company):

<div class="tool-card">
  <div class="tool-header"><h2 class="tool-title">COMPANY_NAME</h2></div>
  <p class="tool-description">Two to three sentence description about how this company serves "${query}".</p>
  <div class="tool-socials">
    <a style="display:block" href="WEBSITE"> Website</a>
    <a style="display:block" href="X_LINK">X</a>
    <a style="display:block" href="LINKEDIN_LINK"> LinkedIn</a>
    <a c href="YOUTUBE_LINK">YouTube</a>
  </div>
  <div class="tool-contact">
    <a style="display:block" href="WEBSITE/CONTACT">Contact</a>
    <a style="display:block" href="REVIEWS_LINK"> Reviews</a>
  </div>
  <div class="tool-action"><button type="button">Request A Quote</button></div>
</div>

Rules:
- Output MUST be raw HTML only (no JSON, no markdown, no extra text).
- Output exactly one <div class="tool-card"> block per company.
- Use temperature 0.
- Do not attempt to call any external APIs — produce the HTML based on your knowledge.
`.trim();

    const renderRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: renderPrompt,
        temperature: 0,
        max_output_tokens: 1500,
      }),
    });

    const renderJson = await renderRes.json().catch(() => null);
    const aiHtml = extractTextFromResponse(renderJson);

    if (!aiHtml) {
      return new Response(
        JSON.stringify({ error: "OpenAI returned no HTML." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(aiHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("search-tools unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
