// Model list ko kuch der yaad rakho (har message par dobara na maangna pade).
let MODEL_CACHE = {at: 0, ids: []};

export default {
  async fetch(req, env) {
    // Sirf ye sites Q-AI se baat kar sakti hain.
    const ALLOWED = ["https://qyaaro.github.io", "https://reliable-tarsier-fdbc17.netlify.app"];
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
      "Content-Type": "application/json"
    };
    const out = (reply) => new Response(JSON.stringify({reply}), {headers: cors});
    if (req.method === "OPTIONS") return new Response(null, {headers: cors});
    if (req.method !== "POST") return out("QYAARO server chal raha hai.");
    if (!ALLOWED.includes(origin)) return new Response(JSON.stringify({reply: "Ye site allowed nahi hai."}), {status: 403, headers: cors});
    if (!env.GROQ_KEY) return out("Error: GROQ_KEY secret nahi mila.");

    let body;
    try { body = await req.json(); } catch (e) { return out("Error: bad request."); }
    // System prompt lamba ho sakta hai (persona + niyam), isliye limit badi rakhi hai.
    const system = String(body.system || "").slice(0, 12000);
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && typeof m.content === "string" && m.content.trim())
      .slice(-20)
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, 4000)
      }));
    if (!history.length) return out("Error: koi message nahi mila.");

    const auth = {"Authorization": "Bearer " + env.GROQ_KEY};

    // Groq se aaj ke chalne wale chat models ki list lo.
    let ids = MODEL_CACHE.ids;
    if (!ids.length || Date.now() - MODEL_CACHE.at > 10 * 60 * 1000) {
      try {
        const r = await fetch("https://api.groq.com/openai/v1/models", {headers: auth, signal: AbortSignal.timeout(6000)});
        const j = await r.json();
        const fresh = (j.data || []).filter(m => m.active !== false).map(m => m.id);
        if (fresh.length) { ids = fresh; MODEL_CACHE = {at: Date.now(), ids: fresh}; }
      } catch (e) {
        if (!ids.length) return out("Groq models list nahi mili: " + e.message);
      }
    }

    const bad = /whisper|guard|tts|orpheus|playai|embed|safeguard|compound|distil-whisper|transcri|vision-only/i;
    const chat = ids.filter(id => !bad.test(id));
    // Pasand ka order: pehle bade aur samajhdaar models, phir chhote.
    const prefer = [/70b|120b|large|versatile|maverick|kimi/i, /gpt-oss/i, /qwen/i, /llama/i];
    const ranked = [...chat].sort((a, b) => {
      const ra = prefer.findIndex(p => p.test(a)), rb = prefer.findIndex(p => p.test(b));
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });
    const candidates = ranked.slice(0, 4);
    if (!candidates.length) return out("Groq par koi chat model nahi mila. Models: " + ids.join(", ").slice(0, 200));

    async function ask(model) {
      let r;
      try {
        r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(12000),
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

    const errs = [];
    // Pehle sabse achha model, na chale to baaki ek saath.
    try { return out(await ask(candidates[0])); } catch (e) { errs.push(e.message); }
    if (candidates.length > 1) {
      try { return out(await Promise.any(candidates.slice(1).map(ask))); }
      catch (agg) { (agg.errors || [agg]).forEach(e => errs.push(e.message)); }
    }
    return out("Abhi jawab nahi mil paya. Detail: " + errs.join(" | ").slice(0, 400));
  }
};
