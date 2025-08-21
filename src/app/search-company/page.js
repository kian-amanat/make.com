"use client";
import { useRef, useState } from "react";
import "./InputPage.css";

export default function InputPage() {
  const companiesRef = useRef([]);
  const [inputs, setInputs] = useState([0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const addInput = () => {
    setInputs([...inputs, inputs.length]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const companies = companiesRef.current
      .map((ref) => ref?.value.trim())
      .filter((v) => v);

    if (!companies.length) {
      setMessage("❌ Please enter at least one company.");
      setLoading(false);
      return;
    }

    // in your InputPage handleSubmit (client)
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies }),
      });

      const data = await res.json();
      if (res.ok && data.html) {
        setMessage(data.html); // render returned raw HTML
        console.log("Generated HTML:", data.html);
        // optional: inspect candidate lists from server debug
        console.log("Debug candidates:", data.debug?.companyCandidates);
      } else {
        console.error("API error:", data);
        setMessage("❌ Error: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      setMessage("⚠️ Failed to connect to server.");
    }
  };

  return (
    <div className="container">
      <form onSubmit={handleSubmit} className="form">
        {inputs.map((id, index) => (
          <input
            key={id}
            type="text"
            ref={(el) => (companiesRef.current[index] = el)}
            placeholder={`Company ${index + 1}`}
            className="input"
          />
        ))}
        <button type="button" onClick={addInput} className="button secondary">
          + Add Company
        </button>
        <button type="submit" disabled={loading} className="button primary">
          {loading ? "Sending..." : "Submit"}
        </button>
      </form>
      {message && (
        <div
          className="message"
          dangerouslySetInnerHTML={{ __html: message }}
        />
      )}
    </div>
  );
}
