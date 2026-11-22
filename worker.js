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
    if (!env.GROQ_KEY && !env.GEMINI_KEY) return out("Error: GROQ_KEY ya GEMINI_KEY secret nahi mila.");

    let body;
    try { body = await req.json(); } catch (e) { return out("Error: bad request."); }
    const system = String(body.system || "").slice(0, 2000);
    const history = (body.messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000)
    }));

    async function groq(model) {
      let r;
      try {
        r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {"Content-Type": "application/json", "Authorization": "Bearer " + env.GROQ_KEY},
          body: JSON.stringify({model, max_tokens: 600, messages: [{role: "system", content: system}, ...history]})
        });
      } catch (e) {
        throw new Error("groq/" + model + ": " + (e.name === "TimeoutError" ? "timeout" : e.message));
      }
      const j = await r.json().catch(() => ({}));
      const text = j.choices?.[0]?.message?.content;
      if (text) return text;
      throw new Error("groq/" + model + " [" + r.status + "]: " + String(j.error?.message || "khali").slice(0, 70));
    }

    async function gemini(model) {
      let r;
      try {
        r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          signal: AbortSignal.timeout(8000),
          headers: {"Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY},
          body: JSON.stringify({
            systemInstruction: {parts: [{text: system}]},
            contents: history.map(m => ({role: m.role === "assistant" ? "model" : "user", parts: [{text: m.content}]}))
          })
        });
      } catch (e) {
        throw new Error("gemini: " + (e.name === "TimeoutError" ? "timeout" : e.message));
      }
      const j = await r.json().catch(() => ({}));
      const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
      if (text) return text;
      throw new Error("gemini [" + r.status + "]: " + String(j.error?.message || "khali").slice(0, 70));
    }

    const errors = [];
    // 1) Groq: do model ek saath, jo pehle jawab de.
    if (env.GROQ_KEY) {
      try {
        return out(await Promise.any([groq("llama-3.3-70b-versatile"), groq("llama-3.1-8b-instant")]));
      } catch (agg) { (agg.errors || [agg]).forEach(e => errors.push(e.message)); }
    }
    // 2) Backup: Gemini
    if (env.GEMINI_KEY) {
      try { return out(await gemini("gemini-flash-latest")); }
      catch (e) { errors.push(e.message); }
    }
    return out("Abhi jawab nahi mil paya. Detail: " + errors.join(" | "));
  }
};
