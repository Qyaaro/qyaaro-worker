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

    const models = ["gemini-3.8-flash", "gemini-flash-latest"];

    async function ask(model) {
      let r;
      try {
        r = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          {
            method: "POST",
            signal: AbortSignal.timeout(20000),
            headers: {"Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY},
            body: JSON.stringify({systemInstruction: {parts: [{text: system}]}, contents})
          }
        );
      } catch (e) {
        throw new Error(model + ": " + (e.name === "TimeoutError" ? "20s timeout" : e.message));
      }
      const j = await r.json().catch(() => ({}));
      const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
      if (text) return text;
      throw new Error(model + " [" + r.status + "]: " + String(j.error?.message || j.promptFeedback?.blockReason || "khali").slice(0, 60));
    }

    try {
      // Dono model ek saath chalte hain, jo pehle sahi jawab de wahi use hota hai.
      return out(await Promise.any(models.map(ask)));
    } catch (agg) {
      const errs = (agg.errors || [agg]).map(e => e.message).join(" | ");
      return out("Gemini abhi busy hai, thodi der baad dobara bol. Detail: " + errs);
    }
  }
};
