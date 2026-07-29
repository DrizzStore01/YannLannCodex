/**
 * Client untuk AlwaysCodex REST API & Chat completions.
 * Menggunakan official SDK 'alwayscodex-api' secara native.
 */
import codex from "alwayscodex-api";

function getRealApiKey(apikey) {
  if (!apikey) return "agent";
  const k = String(apikey).trim().toLowerCase();
  // Map virtual public aliases ke real backend API key ('agent')
  if (["yannlann-free", "public", "guest", "free"].includes(k)) {
    return "agent";
  }
  return apikey;
}

export function getSDKClient(config) {
  const realKey = getRealApiKey(config.apikey);
  const rootUrl = (config.baseUrl || "https://api.alwayscodex.my.id")
    .replace(/\/api\/v4\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");

  return codex({
    apiKey: realKey,
    baseURL: rootUrl,
    timeout: config.requestTimeout || 60000,
  });
}

function resolveModelMethod(model) {
  const m = String(model || "gpt4").trim().toLowerCase();
  if (m.includes("gemini")) return "gemini";
  return "gpt4";
}

export async function* chatCompletionStream(config, messages, { signal } = {}) {
  const sdk = getSDKClient(config);
  const method = resolveModelMethod(config.model);
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "Halo";

  try {
    const res = await sdk.ai[method]({ text: lastUserMsg });
    const reply = extractReply(res);
    if (reply) {
      yield { type: "content", text: reply };
      return;
    }
    throw new Error("Respons API kosong");
  } catch (e) {
    throw new Error(`Gagal memanggil model AI [${method}]: ${e.message}`);
  }
}

export async function chatCompletion(config, messages, { signal } = {}) {
  const sdk = getSDKClient(config);
  const method = resolveModelMethod(config.model);
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "Halo";

  try {
    const res = await sdk.ai[method]({ text: lastUserMsg });
    const reply = extractReply(res);
    if (reply != null) return reply;
    throw new Error("Respons API kosong");
  } catch (e) {
    throw new Error(`Gagal memanggil model AI [${method}]: ${e.message}`);
  }
}

export function extractReply(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  
  const choice = data.choices?.[0];
  if (choice?.message?.content != null) return String(choice.message.content);
  if (choice?.text != null) return String(choice.text);

  for (const key of ["result", "reply", "data", "response", "message", "text"]) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (v && typeof v === "object") {
      for (const inner of ["reply", "response", "content", "message", "text", "answer"]) {
        if (typeof v[inner] === "string" && v[inner].length > 0) return v[inner];
      }
    }
  }
  return null;
}

export async function listModels(config) {
  return ["gpt4", "gemini"];
}
