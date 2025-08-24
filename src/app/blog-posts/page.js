"use client";
import { useState } from "react";

export default function BlogGenerator() {
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState(800);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/verify/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, length, keyword }),
      });

      const text = await response.text();
      setResult(text);
    } catch (error) {
      console.error("Error generating blog:", error);
      setResult("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 font-sans text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 text-center">
        AI Blog Generator
      </h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white p-6 rounded-lg shadow-sm border border-gray-200"
      >
        <div>
          <label className="block mb-1 font-medium text-gray-700">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="15 tips to optimize cloud spending"
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-medium text-gray-700">
            Length (words)
          </label>
          <input
            type="number"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-medium text-gray-700">
            Focus SEO Keyword
          </label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="cloud"
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {loading ? "Generating..." : "Generate Blog"}
        </button>
      </form>

      {result && (
        <div className="mt-8 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900">
            Generated Output
          </h2>
          <pre className="whitespace-pre-wrap text-gray-800 text-base leading-relaxed">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
