import { useState } from "react";

function App() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch(
        `https://cf-ai-planpal.shindeprerna1012.workers.dev/?prompt=${encodeURIComponent(prompt)}`
      );

      const text = await res.text();
      setResponse(text);
    } catch (err) {
      setResponse("Error contacting the agent.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>PlanPal Chat</h1>
      <textarea
        rows={4}
        placeholder="Ask something..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <br />
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "Asking..." : "Ask"}
      </button>

      <div style={{ marginTop: "2rem", whiteSpace: "pre-wrap" }}>
        <strong>Response:</strong>
        <div>{response}</div>
      </div>
    </div>
  );
}

export default App;
