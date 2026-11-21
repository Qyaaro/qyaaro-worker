export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "https://qyaaro.github.io",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    if (req.method === "OPTIONS") return new Response(null, {headers: cors});
    if (req.method !== "POST") return new Response(JSON.stringify({reply: "QYAARO server chal raha hai."}), {headers: cors});
    try {
      const {system, messages} = await req.json();
      const MODEL = "gemini-3.8-flash";
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
        {
          method: "POST",
          headers: {"Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY},
          body: JSON.stringify({
            systemInstruction: {parts: [{text: String(system || "").slice(0, 2000)}]},
            contents: (messages || []).slice(-20).map(m => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{text: String(m.content).slice(0, 2000)}]
            }))
          })
        }
      );
      const j = await r.json();
      const reply = j.candidates?.[0]?.content?.parts?.[0]?.text;
      return new Response(JSON.stringify({reply: reply || "Abhi jawab nahi mil paya."}), {headers: cors});
    } catch (e) {
      return new Response(JSON.stringify({reply: "Server mein dikkat hai."}), {headers: cors});
    }
  }
};
