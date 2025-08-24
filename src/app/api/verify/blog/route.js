import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { topic, length, keyword } = await req.json();

    if (!topic || !length || !keyword) {
      return new Response(
        "Missing input fields: topic, length, and keyword are required.",
        { status: 400, headers: { "Content-Type": "text/plain" } }
      );
    }

    const prompt = `
You are an AI with live web access. Write a **full SEO-optimized blog post**:

Topic: ${topic}
Word Length: ${length}
Focus Keyword: ${keyword}

Requirements:
- Natural, human-readable blog format (headings, paragraphs, subheadings).
- Use the keyword naturally throughout the post.
- Include **fully corrected, real, relevant links**.
- At the end, provide a small SEO snippet: meta title, meta description, and suggested slug.
- Output plain text only. Do NOT output JSON or markdown.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const blogText = response.choices[0].message.content;

    // Return plain text directly
    return new Response(blogText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error generating blog:", error);
    return new Response(`Failed to generate blog: ${error.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
