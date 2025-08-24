import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SERPER_KEY = process.env.SERPER_API_KEY;

if (!SERPER_KEY) throw new Error("Missing SERPER_API_KEY");

// Verify URL quickly using HEAD request
async function verifyUrl(url) {
  try {
    if (!url) return null;
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.status >= 200 && res.status < 400) return url;
  } catch (e) {}
  return null;
}

// Search for LinkedIn & YouTube with AI web search fallback
async function searchSocial(company, platform) {
  const query = `${company} official ${platform}`;
  try {
    // 1️⃣ Primary: Serper search
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_KEY,
      },
      body: JSON.stringify({ q: query, num: 30 }),
    });
    const data = await res.json();
    const urls = data.organic?.map((item) => item.link) || [];

    for (const url of urls) {
      const valid = await verifyUrl(url);
      if (!valid) continue;

      // Normalize URL to lowercase for consistent checks
      const lowerUrl = url.toLowerCase();

      if (platform === "LinkedIn") {
        // Consider company pages, personal profiles, or "official" mentions
        if (
          lowerUrl.includes("linkedin.com/company/") ||
          lowerUrl.includes("linkedin.com/in/") ||
          lowerUrl.includes("linkedin.com/pub/") ||
          lowerUrl.includes("linkedin.com/school/") ||
          lowerUrl.includes("linkedin.com/showcase/") ||
          lowerUrl.includes("linkedin.com/feed/update/") // sometimes official posts
        ) {
          return url;
        }
      }

      if (platform === "YouTube") {
        // Consider channels, custom URLs, and verified brand pages
        if (
          lowerUrl.includes(`youtube.com/${company}Security`) ||
          lowerUrl.includes("youtube.com/@") ||
          lowerUrl.includes("youtube.com/channel/") ||
          lowerUrl.includes("youtube.com/c/") ||
          lowerUrl.includes("youtube.com/user/") ||
          lowerUrl.includes("youtube.com/official") ||
          lowerUrl.includes("youtube.com/brand") ||
          lowerUrl.includes("youtube.com/watch?v=") ||
          lowerUrl.includes(`youtube.com/${company}`)
        ) {
          return url;
        }
      }
    }

    // 2️⃣ Fallback: AI with web search
    const aiPrompt = `
You are a web-searching AI. Your task is to find the official ${platform} page for "${company}".
Use any available public information or web search to locate the correct page.
Return only the direct URL, nothing else.
    `;

    const aiRes = await client.chat.completions.create({
      model: "gpt-5", // GPT-5 model with web search capability
      messages: [{ role: "user", content: aiPrompt }],
      temperature: 0,
    });

    const aiUrl = aiRes.choices?.[0]?.message?.content?.trim();
    return aiUrl && (await verifyUrl(aiUrl)) ? aiUrl : null;
  } catch (e) {
    return null;
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const companies = body?.companies;

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return new Response(JSON.stringify({ error: "No companies provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const htmlCards = [];

    for (const company of companies) {
      const prompt = `
You are an AI assistant. Generate a single HTML card for the IaC company "${company}".
- Write a 3-4 sentence description.
- Provide website, contact, and reviews links.
- Return only raw HTML in this format:

<div class="tool-card">
  <div class="tool-header"><h2 class="tool-title">COMPANY_NAME</h2></div>
  <p class="tool-description">DESCRIPTION</p>
  <div class="tool-socials">
    <a style="display:block" href="WEBSITE">Website</a>
    <a style="display:block" href="X_LINK">X</a>
    <a style="display:block" href="LINKEDIN_LINK">LinkedIn</a>
    <a style="display:block" href="YOUTUBE_LINK">YouTube</a>
  </div>
  <div class="tool-contact">
    <a style="display:block" href="CONTACT_LINK">Contact</a> 
    <a style="display:block" href="REVIEWS_LINK">Reviews</a>
  </div>
</div>
`;

      const aiRes = await client.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: "You are a IaC company info extractor AI.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      });

      let aiHtml = aiRes.choices?.[0]?.message?.content || "";

      // Extract AI-generated URLs
      const urlRegex = /href=["']([^"']+)["']/g;
      let match;
      const verifiedMap = {};
      const urlChecks = [];

      while ((match = urlRegex.exec(aiHtml)) !== null) {
        const url = match[1];
        if (url.includes("http")) {
          urlChecks.push(verifyUrl(url).then((v) => (verifiedMap[url] = v)));
        }
      }
      await Promise.all(urlChecks);

      // Parallel search for LinkedIn and YouTube with AI web search
      const [linkedIn, youtube] = await Promise.all([
        searchSocial(company, "LinkedIn"),
        searchSocial(company, "YouTube"),
      ]);

      // Replace placeholders
      const finalHtml = aiHtml
        .replace(/href="LINKEDIN_LINK"/g, `href="${linkedIn || ""}"`)
        .replace(/href="YOUTUBE_LINK"/g, `href="${youtube || ""}"`)
        .replace(/href="X_LINK"/g, `href="${verifiedMap["X_LINK"] || ""}"`)
        .replace(/href="WEBSITE"/g, `href="${verifiedMap["WEBSITE"] || ""}"`)
        .replace(
          /href="CONTACT_LINK"/g,
          `href="${verifiedMap["CONTACT_LINK"] || ""}"`
        )
        .replace(
          /href="REVIEWS_LINK"/g,
          `href="${verifiedMap["REVIEWS_LINK"] || ""}"`
        );

      htmlCards.push(finalHtml);
    }

    return new Response(JSON.stringify({ html: htmlCards.join("\n") }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify error", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
