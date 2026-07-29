/**
 * Client untuk AlwaysCodex chat completions API.
 * Format respons API belum terdokumentasi, jadi extractReply() menerima
 * beberapa bentuk umum (OpenAI-style dan custom {success, result/reply/...}).
 */

function getRealApiKey(apikey) {
  if (!apikey) return "agent";
  const k = String(apikey).trim().toLowerCase();
  // Map virtual public aliases ke real backend API key ('agent')
  if (["yannlann-free", "public", "guest", "free"].includes(k)) {
    return "agent";
  }
  return apikey;
}

export async function* chatCompletionStream(config, messages, { signal } = {}) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const realKey = getRealApiKey(config.apikey);

  const body = {
    model: config.model,
    messages,
    stream: true,
    apikey: realKey,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeout || 60000);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${realKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }

  if (!resp.ok) {
    clearTimeout(timer);
    const text = await resp.text();
    throw new Error(`API error (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    clearTimeout(timer);
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("JSON invalid"); }
    const reply = extractReply(data);
    if (reply) yield { type: "content", text: reply };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of resp.body) {
      clearTimeout(timer); // connection alive
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") return;
        if (!dataStr) continue;
        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;
          if (delta) {
             if (delta.reasoning_content) {
                yield { type: "reasoning", text: delta.reasoning_content };
             }
             if (delta.content) {
                yield { type: "content", text: delta.content };
             }
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(config, messages, { signal } = {}) {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const realKey = getRealApiKey(config.apikey);

  const body = {
    model: config.model,
    messages,
    stream: false,
    apikey: realKey,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeout);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${realKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons bukan JSON (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  }

  if (!resp.ok || data.success === false) {
    const msg = data.error || data.message || `HTTP ${resp.status}`;
    throw new Error(`API error: ${msg}${data.message && data.error ? ` — ${data.message}` : ""}`);
  }

  const reply = extractReply(data);
  if (reply == null) {
    throw new Error(`Format respons tidak dikenali: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return reply;
}

export function extractReply(data) {
  // OpenAI-style
  const choice = data.choices?.[0];
  if (choice?.message?.content != null) return String(choice.message.content);
  if (choice?.text != null) return String(choice.text);

  // Bentuk custom yang umum dipakai API sejenis
  for (const key of ["result", "data", "response"]) {
    const v = data[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      for (const inner of ["reply", "response", "content", "message", "text", "answer"]) {
        if (typeof v[inner] === "string") return v[inner];
      }
    }
  }
  for (const key of ["reply", "content", "message", "text", "answer"]) {
    if (typeof data[key] === "string") return data[key];
  }
  return null;
}

export async function listModels(config) {
  const realKey = getRealApiKey(config.apikey);
  const FALLBACK_MODELS = ["qwen3.7-plus", "qwen3.8-max-preview", "gpt-4o", "claude-3-5-sonnet", "deepseek-r1"];

  try {
    const url = `${config.baseUrl.replace(/\/$/, "")}/models?apikey=${encodeURIComponent(realKey)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${realKey}` },
    });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return FALLBACK_MODELS;
    }
    if (!resp.ok || data.success === false) {
      return FALLBACK_MODELS;
    }
    const models = Array.isArray(data) ? data : data.data || data.models || data.result || [];
    const parsed = models.map((m) => (typeof m === "string" ? m : m.id || m.name || JSON.stringify(m)));
    return parsed.length ? parsed : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}
