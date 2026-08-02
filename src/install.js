"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { packProject } = require("./pack");
const { resolveLocal } = require("./project");

async function installProject(project, options = {}) {
  const serverUrl = normalizeServerUrl(options.serverUrl || project.serverUrl);
  const apiKey = options.apiKey || project.apiKey;
  if (!serverUrl) throw new Error("Komari server URL is required; use --server or KOMARI_SERVER_URL");
  if (!apiKey) throw new Error("Komari API Key is required; use --api-key or KOMARI_API_KEY");

  const archivePath = options.archivePath || resolveLocal(project.root, project.archive);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`package does not exist: ${path.relative(project.root, archivePath)}; run build before install`);
  }

  const response = await fetch(`${serverUrl}/api/admin/plugin/install`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/zip",
    },
    body: fs.readFileSync(archivePath),
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(`plugin install failed (${response.status}): ${formatBody(body)}`);

  const result = { response: body, serverUrl, short: project.manifest.short };
  result.plugin = await findPlugin(serverUrl, apiKey, project.manifest.short);

  if (options.enable) {
    result.enable = await rpcCall(serverUrl, apiKey, "admin:setPluginEnabled", {
      short: project.manifest.short,
      enabled: true,
      approved: options.approved === true,
    });
    result.plugin = await findPlugin(serverUrl, apiKey, project.manifest.short);
  }
  return result;
}

async function packAndInstall(project, options = {}) {
  const archivePath = await packProject(project);
  return installProject(project, { ...options, archivePath });
}

async function findPlugin(serverUrl, apiKey, short) {
  const plugins = await rpcCall(serverUrl, apiKey, "admin:listPlugins");
  if (Array.isArray(plugins)) return plugins.find((plugin) => plugin.short === short) || null;
  if (plugins && Array.isArray(plugins.plugins)) return plugins.plugins.find((plugin) => plugin.short === short) || null;
  return null;
}

async function rpcCall(serverUrl, apiKey, method, params) {
  const response = await fetch(`${serverUrl}/api/rpc2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(`RPC request failed (${response.status}): ${formatBody(body)}`);
  if (body && body.error) throw new Error(`RPC ${method} failed: ${body.error.message || formatBody(body.error)}`);
  return body ? body.result : undefined;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatBody(body) {
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function normalizeServerUrl(value) {
  if (!value) return "";
  return new URL(value).toString().replace(/\/$/, "");
}

module.exports = { installProject, packAndInstall };
