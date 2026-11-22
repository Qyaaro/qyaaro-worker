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
    if (!env.GROQ_KEY) return out("Error: GROQ_KEY secret nahi mila.");

    let body;
    try { body = await req.json(); } catch (e) { return out("Error: bad request."); }
    const system = String(body.system || "").slice(0, 2000);
    const history = (body.messages || []).slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 2000)
    }));

    const auth = {"Authorization": "Bearer " + env.GROQ_KEY};

    // Groq se aaj ke chalne wale chat models ki list lo.
    let ids = [];
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", {headers: auth, signal: AbortSignal.timeout(6000)});
      const j = await r.json();
      ids = (j.data || []).filter(m => m.active !== false).map(m => m.id);
    } catch (e) { return out("Groq models list nahi mili: " + e.message); }

    const bad = /whisper|guard|tts|orpheus|playai|embed|safeguard|compound|distil-whisper|transcri|vision-only/i;
    const chat = ids.filter(id => !bad.test(id));
    // Pasand ka order: tez aur chhote pehle, phir bade.
    const prefer = [/instant|8b|flash|mini|small/i, /llama/i, /gpt-oss/i, /qwen/i, /kimi/i];
    const ranked = [...chat].sort((a, b) => {
      const ra = prefer.findIndex(p => p.test(a)), rb = prefer.findIndex(p => p.test(b));
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });
    const candidates = ranked.slice(0, 3);
    if (!candidates.length) return out("Groq par koi chat model nahi mila. Models: " + ids.join(", ").slice(0, 200));

    async function ask(model) {
      let r;
      try {
        r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {"Content-Type": "application/json", ...auth},
          body: JSON.stringify({model, max_tokens: 700, messages: [{role: "system", content: system}, ...history]})
        });
      } catch (e) {
        throw new Error(model + ": " + (e.name === "TimeoutError" ? "timeout" : e.message));
      }
      const j = await r.json().catch(() => ({}));
      let text = j.choices?.[0]?.message?.content || "";
      text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (text) return text;
      throw new Error(model + " [" + r.status + "]: " + String(j.error?.message || "khali").slice(0, 70));
    }

    try {
      return out(await Promise.any(candidates.map(ask)));
    } catch (agg) {
      const errs = (agg.errors || [agg]).map(e => e.message).join(" | ");
      return out("Abhi jawab nahi mil paya. Detail: " + errs);
    }
  }
};
