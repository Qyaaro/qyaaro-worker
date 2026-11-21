export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "https://qyaaro.github.io",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    const out = (reply) => new Response(JSON.stringify({reply}), {headers: cors});
    if (req.method === "OPTIONS") return new Response(null, {headers: cors});
    if (req.method !== "POST") return out("QYAARO server chal raha hai.");
    if (!env.GEMINI_KEY) return out("Error: GEMINI_KEY secret nahi mila.");

    let body;
    try { body = await req.json(); } catch (e) { return out("Error: bad request."); }
    const system = String(body.system || "").slice(0, 2000);
    const contents = (body.messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{text: String(m.content).slice(0, 2000)}]
    }));

    const models = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
    let lastError = "";
    for (const model of models) {
      try {
        const r = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          {
            method: "POST",
            headers: {"Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY},
            body: JSON.stringify({systemInstruction: {parts: [{text: system}]}, contents})
          }
        );
        const j = await r.json();
        const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
        if (text) return out(text);
        lastError = model + ": " + (j.error?.message || j.promptFeedback?.blockReason || "khali jawab");
      } catch (e) {
        lastError = model + ": " + e.message;
      }
    }
    return out("Gemini error -> " + lastError.slice(0, 300));
  }
};
