// app/api/verify/route.js
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

    const SERPER_KEY = process.env.SERPER_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!SERPER_KEY || !OPENAI_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing server env SERPER_API_KEY or OPENAI_API_KEY",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---------- Helpers ----------
    async function serperSearch(query, num = 10) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": SERPER_KEY,
        },
        body: JSON.stringify({ q: query, num }),
      });
      return res.ok ? await res.json() : null;
    }

    function normalizeCandidateUrl(u) {
      if (!u || typeof u !== "string") return null;
      let s = u.trim();
      if (s.startsWith("www.")) s = "https://" + s;
      if (!/^https?:\/\//i.test(s)) {
        if (/^[^\/\s]+\.[a-z]{2,}/i.test(s)) s = "https://" + s;
        else return null;
      }
      s = s.replace(/[,.;:?!)\]]+$/g, "");
      return s;
    }

    // enhanced verifyUrl: also detect IaC keywords and sample email
    async function verifyUrl(url, companyName) {
      try {
        const resp = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": "verify-bot/1.0" },
        });
        if (!(resp.status >= 200 && resp.status < 400)) return null;
        const text = await resp.text();
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "";
        const pageLower = (title + " " + text).toLowerCase();

        // IaC keywords to check for
        const iacKeywords = [
          "infrastructure as code",
          "infrastructure-as-code",
          "iac",
          "terraform",
          "pulumi",
          "cloudformation",
          "configuration as code",
          "infrastructure automation",
          "deploy infrastructure",
        ];

        const includesName = pageLower.includes(
          (companyName || "").toLowerCase().split(" ")[0] || ""
        );
        const includesIac = iacKeywords.some((k) => pageLower.includes(k));
        const emailMatch = text.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        const sampleEmail = emailMatch ? emailMatch[0] : null;

        return {
          url,
          status: resp.status,
          title,
          includesName,
          includesIac,
          sampleEmail,
        };
      } catch (e) {
        return null;
      }
    }

    function escapeHtml(s = "") {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function pickBestLink(company, key) {
      try {
        if (
          company.verified &&
          company.verified[key] &&
          company.verified[key].url
        )
          return company.verified[key].url;
        const raw = company.candidates?.[key];
        if (!raw) return null;
        if (typeof raw === "string") return raw;
        if (Array.isArray(raw)) return raw.find(Boolean) || null;
        return null;
      } catch (e) {
        return null;
      }
    }

    // ---------- Build candidates using multiple IaC-focused Serper queries ----------
    const companyCandidates = [];

    for (const name of companies) {
      // targeted IaC-focused plus general queries
      const queries = [
        `${name} infrastructure as code`,
        `${name} IaC`,
        `${name} terraform`,
        `${name} pulumi`,
        `${name} "infrastructure as code" official site`,
        `${name} official site`,
        `${name} LinkedIn`,
        `${name} Twitter`,
        `${name} X`,
        `${name} YouTube`,
        `${name} reviews`,
        `${name} contact`,
      ];

      let combinedOrganic = [];
      for (const q of queries) {
        const r = await serperSearch(q, 6);
        if (!r) continue;
        const organic = r.organic || [];
        combinedOrganic = combinedOrganic.concat(organic);
      }

      // Deduplicate by link
      const seen = new Set();
      combinedOrganic = combinedOrganic.filter((r) => {
        if (!r?.link) return false;
        const norm = r.link.trim();
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });

      // collect arrays for each field
      const candidates = {
        website: [],
        linkedin: [],
        youtube: [],
        x: [],
        contact: [],
        reviews: [],
        email: [],
        rawOrganic: combinedOrganic.slice(0, 12).map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        })),
      };

      // heuristic assignment into buckets
      for (const r of combinedOrganic) {
        const link = normalizeCandidateUrl(r.link) || r.link;
        if (!link) continue;
        const l = link.toLowerCase();

        if (l.includes("linkedin.com/")) candidates.linkedin.push(link);
        else if (l.includes("youtube.com/") || l.includes("youtu.be/"))
          candidates.youtube.push(link);
        else if (l.includes("twitter.com/") || l.includes("x.com/"))
          candidates.x.push(link);
        else if (
          /trustpilot|g2\.com|capterra|glassdoor|google.com\/maps|reviews/.test(
            l
          ) ||
          (r.snippet && /review/i.test(r.snippet))
        ) {
          candidates.reviews.push(link);
        } else if (
          /contact|contact-us|contactus|\/contact/i.test(l) ||
          (r.snippet && /contact/i.test(r.snippet))
        ) {
          candidates.contact.push(link);
        } else {
          candidates.website.push(link);
        }
      }

      // normalize and dedupe arrays
      for (const k of Object.keys(candidates)) {
        candidates[k] = (candidates[k] || [])
          .map((u) => normalizeCandidateUrl(u) || u)
          .filter(Boolean);
        candidates[k] = Array.from(new Set(candidates[k]));
      }

      // Verify top candidates and detect IaC content
      const verified = {};
      const keysToVerify = [
        "website",
        "contact",
        "linkedin",
        "youtube",
        "x",
        "reviews",
      ];
      for (const key of keysToVerify) {
        const arr = candidates[key] || [];
        for (const candidateUrl of arr.slice(0, 3)) {
          const v = await verifyUrl(candidateUrl, name);
          if (v) {
            // require that either it includes company name OR includes IaC keyword to be considered strong match
            verified[key] = v;
            if (v.sampleEmail) candidates.email.push(v.sampleEmail);
            break;
          }
        }
      }

      // compute whether there is any IaC signal across verified results or snippets
      const hasIacSignal =
        Object.values(verified).some((v) => v && v.includesIac) ||
        candidates.rawOrganic.some((r) =>
          (r.title + " " + (r.snippet || ""))
            .toLowerCase()
            .includes("infrastructure as code")
        );

      companyCandidates.push({
        name,
        candidates,
        verified,
        isIacCandidate: !!hasIacSignal,
      });
    }

    // ---------- Prepare strict prompt for OpenAI that demands IaC relevance ----------
    const prompt = `
You are a data extraction assistant focused on Infrastructure-as-Code (IaC) companies.

Input: a JSON array of companies, each with candidate links (SERPER results + verified meta). DO NOT search the web. Use ONLY links provided in the input.

For each input company name, you MUST:
1) Identify the official company that offers Infrastructure-as-Code (IaC) products or services (e.g., Terraform/HashiCorp, Pulumi, etc.).
2) If multiple candidates exist, choose the one that is clearly an IaC company (page contains IaC keywords like "infrastructure as code", "IaC", "terraform", "pulumi", "cloudformation"). 
3) If none of the candidates are IaC, output a minimal card that states: "No IaC company found for <input name>" (no links), instead of returning unrelated companies.

For IaC companies, choose the single best official link for: website, contact, email (if available), X (Twitter/X), LinkedIn, YouTube, and the best reviews link. If a field is missing, omit it.

Write a 2–3 sentence plain-text description of the IaC company (no markdown, no citations). Then output the final result STRICTLY as raw HTML only (no JSON, no commentary) using this exact card format (replace placeholders with the actual links):

<div class="tool-card">
  <div class="tool-header"><h2 class="tool-title">COMPANY_NAME</h2></div>
  <p class="tool-description">Two to three sentence description about how this company serves about company.</p>
  <div class="tool-socials">
    <a style="display:block" href="WEBSITE">🌐 Website</a>
    <a style="display:block" href="X_LINK">X</a>
    <a style="display:block" href="LINKEDIN_LINK">🔗 LinkedIn</a>
    <a style="display:block" href="YOUTUBE_LINK">YouTube</a>
  </div>
  <div class="tool-contact">
    <a style="display:block" href="CONTACT_LINK">Contact</a>
    <a style="display:block" href="REVIEWS_LINK">⭐ Reviews</a>
  </div>
  <div class="tool-action"><button type="button">Request A Quote</button></div>
</div>

Important:
- Replace WEBSITE, X_LINK, LINKEDIN_LINK, YOUTUBE_LINK, EMAIL, CONTACT_LINK, REVIEWS_LINK with the actual links from the candidate lists.
- If no IaC company can be found for a given input, output the minimal "No IaC company found for <name>" card (no links).
- Temperature 0. Use only the input.

Input companies (candidates + verified + isIacCandidate):
${JSON.stringify(companyCandidates, null, 2)}
`.trim();

    // ---------- Call OpenAI Responses API ----------
    const openRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0,
        max_output_tokens: 1000,
        // Enable web search plugin
        tools: [
          {
            name: "web_search",
            type: "web_search",
          },
        ],
        // Optionally allow browsing
        browsing: {
          enabled: true,
        },
      }),
    });

    const openJson = await openRes.json();

    function extractTextFromResponse(resp) {
      if (!resp || !Array.isArray(resp.output)) return "";
      const messageItem =
        resp.output.find((o) => o.type === "message") ||
        resp.output[resp.output.length - 1];
      const contents = messageItem?.content || [];
      let texts = [];
      for (const c of contents) {
        if (!c) continue;
        if (typeof c === "string") texts.push(c);
        else if (c.type === "output_text" && c.text) texts.push(c.text);
        else if (c.text) texts.push(c.text);
        else if (c.delta && c.delta.content) texts.push(c.delta.content);
      }
      return texts.join("\n").trim();
    }

    const aiHtml = extractTextFromResponse(openJson);
    if (!aiHtml) {
      return new Response(
        JSON.stringify({ error: "OpenAI returned no HTML", meta: openJson }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---------- Post-process AI HTML so IaC validation is enforced ----------
    const fragments = aiHtml.split('<div class="tool-card">').slice(1);
    const rebuiltCards = [];

    for (const frag of fragments) {
      const htmlFragment = '<div class="tool-card">' + frag;
      const nameMatch =
        htmlFragment.match(
          /<h2[^>]*class=["']tool-title["'][^>]*>([^<]+)<\/h2>/i
        ) || htmlFragment.match(/<h2[^>]*>([^<]+)<\/h2>/i);
      const descMatch = htmlFragment.match(
        /<p[^>]*class=["']tool-description["'][^>]*>([\s\S]*?)<\/p>/i
      );

      const name = nameMatch ? nameMatch[1].trim() : null;
      const description = descMatch ? descMatch[1].trim() : "";

      // Find matching company entry
      let companyEntry = null;
      if (name) {
        const nLower = name.toLowerCase();
        companyEntry =
          companyCandidates.find(
            (c) =>
              (c.name && c.name.toLowerCase() === nLower) ||
              (c.name && nLower.includes(c.name.toLowerCase())) ||
              (c.name && c.name.toLowerCase().includes(nLower))
          ) || null;
      }
      if (!companyEntry) companyEntry = companyCandidates.find(Boolean);

      // If companyEntry is not flagged as IaC candidate, return minimal "not found IaC" card
      if (!companyEntry?.isIacCandidate) {
        const finalCard = `
<div class="tool-card">
  <div class="tool-header"><h2 class="tool-title">${escapeHtml(
    name || companyEntry?.name || "Company"
  )}</h2></div>
  <p class="tool-description">No IaC company found for ${escapeHtml(
    name || companyEntry?.name || "this name"
  )}. Please check the company name or try a different query.</p>
  <div class="tool-action"><button type="button">Request A Quote</button></div>
</div>
`.trim();
        rebuiltCards.push(finalCard);
        continue;
      }

      // pick best links (prefer verified)
      const website = pickBestLink(companyEntry, "website");
      let contact = pickBestLink(companyEntry, "contact");
      const x =
        pickBestLink(companyEntry, "x") ||
        pickBestLink(companyEntry, "twitter");
      const linkedin = pickBestLink(companyEntry, "linkedin");
      const youtube = pickBestLink(companyEntry, "youtube");
      const reviews = pickBestLink(companyEntry, "reviews");
      const emailCandidate =
        companyEntry?.candidates?.email?.[0] ||
        companyEntry?.verified?.website?.sampleEmail ||
        null;

      // contact fallback to website/contact path
      if (!contact && website) {
        try {
          contact = new URL("/contact", website).toString();
        } catch (e) {
          contact = null;
        }
      }

      // build socials markup
      const socialsArr = [];
      if (website)
        socialsArr.push(`<a href="${escapeHtml(website)}">🌐 Website</a>`);
      if (x) socialsArr.push(`<a href="${escapeHtml(x)}">X</a>`);
      if (linkedin)
        socialsArr.push(`<a href="${escapeHtml(linkedin)}">🔗 LinkedIn</a>`);
      if (youtube)
        socialsArr.push(`<a href="${escapeHtml(youtube)}">YouTube</a>`);

      const socials = socialsArr.join(" ");
      const contactPart = contact
        ? `<a href="${escapeHtml(contact)}">Contact</a>`
        : "";
      const reviewsPart = reviews
        ? contactPart
          ? ` | <a href="${escapeHtml(reviews)}">⭐ Reviews</a>`
          : `<a href="${escapeHtml(reviews)}">⭐ Reviews</a>`
        : "";

      const finalCard = `
<div class="tool-card">
  <div class="tool-header"><h2 class="tool-title">${escapeHtml(
    name || companyEntry.name || "Company"
  )}</h2></div>
  <p class="tool-description">${escapeHtml(description)}</p>
  <div class="tool-socials" style="display:block">
    ${socials}
  </div>
  <div class="tool-contact" style="display:block">
    ${contactPart}
    ${reviewsPart}
  </div>
  <div class="tool-action"><button type="button">Request A Quote</button></div>
</div>
`.trim();

      rebuiltCards.push(finalCard);
    }

    const finalHtml = rebuiltCards.join("\n\n");

    // ---------- Return rebuilt HTML ----------
    return new Response(
      JSON.stringify({ html: finalHtml, debug: { companyCandidates, aiHtml } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
