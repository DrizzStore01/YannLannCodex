// Mock API AlwaysCodex buat ngetes agent loop tanpa API key valid.
// Jalankan: node test/mock-server.js  (port 3999)
// Lalu: AGENTCLI_BASE_URL=http://127.0.0.1:3999/api/v4 node bin/agentcli.js
import http from "node:http";

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.includes("/chat/completions")) {
    res.writeHead(404).end(JSON.stringify({ success: false, error: "not found" }));
    return;
  }
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const payload = JSON.parse(body);
    const messages = payload.messages || [];
    const last = messages[messages.length - 1]?.content || "";

    let reply;
    if (last.startsWith("Hasil tool")) {
      reply = `Oke, ini isi direktorinya. Ada ${last.split("\n").length - 2} entri. Tugas selesai!`;
    } else {
      reply =
        'Gue cek dulu isi direktorinya ya.\n\n```tool_call\n{"tool":"list_dir","args":{"path":"."}}\n```';
    }

    res.setHeader("Content-Type", "application/json");
    // Format respons ala custom API: {success, result: {reply}}
    res.end(JSON.stringify({ success: true, result: { reply } }));
  });
});

server.listen(3999, "127.0.0.1", () => {
  console.log("Mock API jalan di http://127.0.0.1:3999/api/v4");
});
