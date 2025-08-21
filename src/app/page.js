"use client";
import { useState } from "react";

export default function SearchToolsPage() {
  const [q, setQ] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function callSearchTools(query) {
    const res = await fetch("/api/verify/search-tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const text = await res.text();
    if (!res.ok) {
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed?.error || text);
      } catch {
        throw new Error(text || `Status ${res.status}`);
      }
    }
    return text;
  }

  async function resetHistory() {
    setError("");
    setHtml("");
    await fetch("/api/verify/search-tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!q.trim()) {
      setError("Enter a search query");
      return;
    }
    setLoading(true);
    try {
      const resultHtml = await callSearchTools(q.trim());
      setHtml(resultHtml);
    } catch (err) {
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-slate-900 via-gray-900 to-black text-white flex flex-col">
      {/* Navbar */}
      <nav className="backdrop-blur-md bg-white/10 shadow-lg fixed top-0 left-0 w-full z-50 px-8 py-4 flex justify-between items-center border-b border-white/20">
        <h1 className="text-xl font-bold tracking-wide">AI Tools Finder</h1>
        <div className="flex gap-6">
          <a href="/blog-posts" className="hover:text-blue-400 transition">
            Blog Post
          </a>
          <a href="/search-company" className="hover:text-blue-400 transition">
            Search for campany name
          </a>
          {/* <a href="/about" className="hover:text-blue-400 transition">
            About
          </a> */}
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 container mx-auto px-6 pt-28">
        <div className="backdrop-blur-md bg-white/10 rounded-2xl shadow-xl p-8 border border-white/20">
          <h2 className="text-2xl font-semibold mb-6">
            Add tools to find companies
          </h2>
          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap gap-4 items-center mb-6"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. IaC tools, image generation"
              className="flex-1 px-4 py-3 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 transition shadow-md"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
            <button
              type="button"
              onClick={resetHistory}
              className="px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 transition shadow-md"
            >
              Reset
            </button>
          </form>

          {error && (
            <div className="text-red-400 font-medium mb-4">{error}</div>
          )}

          {/* Results */}
          <div>
            <h3 className="text-lg font-medium mb-4">Result</h3>
            <div
              className="grid gap-6"
              dangerouslySetInnerHTML={{
                __html: html || "<i class='text-gray-400'>No HTML yet</i>",
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
