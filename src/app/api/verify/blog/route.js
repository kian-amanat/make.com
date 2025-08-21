import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { topic, length, keyword } = await req.json();

    // Validate input
    if (!topic || !length || !keyword) {
      return new Response(JSON.stringify({ error: "Missing input fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // AI prompt with web search instructions
    const prompt = `
You are an AI that can access live web information.
Generate a detailed SEO-optimized blog post with the following inputs:

Topic: ${topic}
Word Length: ${length}
Focus SEO Keyword: ${keyword}

Requirements:
1. Include the main keyword naturally throughout the post.
2. Use headings (h2, h3) and lists where appropriate.
3. Include exactly 10 relevant **external links** from live web sources.
4. Generate SEO metadata: meta title, meta description, focus keyword, slug.
5. Output format: JSON:

{
  "blog": {
    "title": "...",
    "content": "...",
    "links": ["...", "..."]
  },
  "seo": {
    "meta_title": "...",
    "meta_description": "...",
    "focus_keyword": "...",
    "slug": "..."
  }
}

Do not include markdown or extra text outside JSON. Use only real URLs from the web.
`;

    // Call OpenAI web-enabled model
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Web-enabled model
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const aiText = response.choices[0].message.content;

    // Parse AI JSON output
    const jsonOutput = JSON.parse(aiText);

    return new Response(JSON.stringify(jsonOutput), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating blog:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate blog",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
