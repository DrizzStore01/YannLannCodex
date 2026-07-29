import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { c } from "./ui.js";

const MCP_CONFIG_PATH = path.join(os.homedir(), ".agentcli", "mcp.json");

export class MCPManager {
  constructor() {
    this.clients = new Map(); // serverName -> process/rpc
    this.tools = []; // Array of { name, description, serverName, originalName, inputSchema }
    this.requestId = 1;
  }

  async init() {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      return;
    }

    try {
      const raw = fs.readFileSync(MCP_CONFIG_PATH, "utf8");
      const config = JSON.parse(raw);
      const servers = config.mcpServers || {};

      for (const [serverName, serverConfig] of Object.entries(servers)) {
        await this.connectServer(serverName, serverConfig);
      }
    } catch (e) {
      console.log(c.yellow(`⚠️ Gagal memuat MCP Config (${MCP_CONFIG_PATH}): ${e.message}`));
    }
  }

  async connectServer(serverName, { command, args = [], env = {} }) {
    try {
      const childEnv = { ...process.env, ...env };
      const proc = spawn(command, args, {
        env: childEnv,
        stdio: ["pipe", "pipe", "ignore"], // stdin, stdout, stderr ignored
      });

      const client = {
        name: serverName,
        proc,
        pendingRequests: new Map(),
        buffer: "",
      };

      proc.stdout.on("data", (chunk) => {
        this.handleData(client, chunk.toString("utf8"));
      });

      proc.on("error", (err) => {
        console.log(c.red(`❌ MCP Server [${serverName}] error: ${err.message}`));
      });

      this.clients.set(serverName, client);

      // 1. Initialize JSON-RPC handshake
      await this.sendRequest(client, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "YanLanCodex", version: "0.1.0" },
      });

      // Send initialized notification
      this.sendNotification(client, "notifications/initialized", {});

      // 2. Fetch list of tools from MCP server
      const toolsRes = await this.sendRequest(client, "tools/list", {});
      const serverTools = toolsRes?.tools || [];

      for (const tool of serverTools) {
        const mcpToolName = `mcp__${serverName}__${tool.name}`;
        this.tools.push({
          name: mcpToolName,
          originalName: tool.name,
          serverName,
          description: tool.description || `MCP Tool from ${serverName}`,
          inputSchema: tool.inputSchema || {},
        });
      }

      console.log(c.dim(`🔌 Connected to MCP Server [${serverName}] (${serverTools.length} tools loaded)`));
    } catch (e) {
      console.log(c.yellow(`⚠️ Gagal menghubungkan MCP Server [${serverName}]: ${e.message}`));
    }
  }

  sendRequest(client, method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const payload = { jsonrpc: "2.0", id, method, params };
      
      client.pendingRequests.set(id, { resolve, reject });
      const str = JSON.stringify(payload) + "\n";
      client.proc.stdin.write(str);

      setTimeout(() => {
        if (client.pendingRequests.has(id)) {
          client.pendingRequests.delete(id);
          reject(new Error(`Timeout MCP request '${method}' to ${client.name}`));
        }
      }, 15000);
    });
  }

  sendNotification(client, method, params) {
    const payload = { jsonrpc: "2.0", method, params };
    client.proc.stdin.write(JSON.stringify(payload) + "\n");
  }

  handleData(client, data) {
    client.buffer += data;
    const lines = client.buffer.split("\n");
    client.buffer = lines.pop(); // sisa buffer belum lengkap

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line.trim());
        if (msg.id && client.pendingRequests.has(msg.id)) {
          const { resolve, reject } = client.pendingRequests.get(msg.id);
          client.pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || "MCP Error"));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // Line JSON incomplete or non-JSON
      }
    }
  }

  async callTool(mcpToolName, args) {
    const tool = this.tools.find((t) => t.name === mcpToolName);
    if (!tool) {
      throw new Error(`MCP Tool '${mcpToolName}' tidak ditemukan.`);
    }

    const client = this.clients.get(tool.serverName);
    if (!client) {
      throw new Error(`MCP Server '${tool.serverName}' tidak aktif.`);
    }

    const res = await this.sendRequest(client, "tools/call", {
      name: tool.originalName,
      arguments: args,
    });

    if (res?.content && Array.isArray(res.content)) {
      return res.content.map((c) => c.text || JSON.stringify(c)).join("\n");
    }
    return JSON.stringify(res || {});
  }

  getToolPrompts() {
    return this.tools.map((t) => {
      return `- ${t.name}: {"tool":"${t.name}","args":${JSON.stringify(t.inputSchema.properties || {})}} — [MCP ${t.serverName}] ${t.description}`;
    });
  }
}

export const mcpManager = new MCPManager();
export { MCP_CONFIG_PATH };
