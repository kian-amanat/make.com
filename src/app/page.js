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

    try {
      const res = await fetch(
        "https://hook.us2.make.com/wpkh4dguk341xxy5gs2hqhelk2evx1nt",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-make-apikey": "ecXU-sDLB-hm6Ue",
          },
          body: JSON.stringify({
            model: "DeepSeek R1T2 Chimera",
            temperature: 0.0,
            max_tokens: 1000,
            companies,
          }),
        }
      );

      if (res.ok) {
        setMessage("✅ Data sent successfully!");
      } else {
        setMessage("❌ Error sending data.");
      }
    } catch (error) {
      console.error(error);
      setMessage("⚠️ Failed to connect to webhook.");
    } finally {
      setLoading(false);
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
      {message && <p className="message">{message}</p>}
    </div>
  );
}
