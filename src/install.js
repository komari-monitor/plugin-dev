"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { packProject } = require("./pack");
const { resolveLocal } = require("./project");

const CHUNK_SIZE = 5 * 1024 * 1024;
const WORKER_COUNT = 5;
const MAX_ATTEMPTS = 4;

async function installProject(project, options = {}) {
  const serverUrl = normalizeServerUrl(options.serverUrl || project.serverUrl);
  const apiKey = options.apiKey || project.apiKey;
  if (!serverUrl) throw new Error("Komari server URL is required; use --server or KOMARI_SERVER_URL");
  if (!apiKey) throw new Error("Komari API Key is required; use --api-key or KOMARI_API_KEY");

  const archivePath = options.archivePath || resolveLocal(project.root, project.archive);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`package does not exist: ${path.relative(project.root, archivePath)}; run build before install`);
  }

  const body = await uploadPluginArchive(serverUrl, apiKey, archivePath);

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

async function uploadPluginArchive(serverUrl, apiKey, archivePath) {
  const size = fs.statSync(archivePath).size;
  const headers = { Authorization: `Bearer ${apiKey}` };
  let uploadID = "";
  try {
    const initResponse = await fetch(`${serverUrl}/api/admin/upload/init`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "plugin",
        size,
        filename: path.basename(archivePath),
      }),
    });
    const initBody = await readResponse(initResponse);
    if (!initResponse.ok || !initBody || initBody.status !== "success") {
      throw new Error(`plugin upload init failed (${initResponse.status}): ${formatBody(initBody)}`);
    }
    uploadID = initBody.data && initBody.data.upload_id;
    if (typeof uploadID !== "string" || initBody.data.chunk_size !== CHUNK_SIZE) {
      throw new Error("plugin upload init returned an invalid chunk configuration");
    }

    const totalChunks = Math.ceil(size / CHUNK_SIZE);
    let nextChunk = 0;
    const file = await fs.promises.open(archivePath, "r");
    try {
      const worker = async () => {
        while (true) {
          const index = nextChunk;
          nextChunk += 1;
          if (index >= totalChunks) return;
          const offset = index * CHUNK_SIZE;
          const length = Math.min(CHUNK_SIZE, size - offset);
          const buffer = Buffer.allocUnsafe(length);
          const { bytesRead } = await file.read(buffer, 0, length, offset);
          if (bytesRead !== length) {
            throw new Error(`failed to read plugin chunk ${index}`);
          }
          await uploadPluginChunk(serverUrl, headers, uploadID, index, buffer);
        }
      };
      await Promise.all(Array.from({ length: Math.min(WORKER_COUNT, totalChunks) }, worker));
    } finally {
      await file.close();
    }

    const mergeResponse = await fetch(`${serverUrl}/api/admin/upload/merge`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: uploadID }),
    });
    const mergeBody = await readResponse(mergeResponse);
    if (!mergeResponse.ok || !mergeBody || mergeBody.status !== "success") {
      throw new Error(`plugin install failed (${mergeResponse.status}): ${formatBody(mergeBody)}`);
    }
    uploadID = "";
    return mergeBody;
  } finally {
    if (uploadID) {
      await fetch(`${serverUrl}/api/admin/upload/cancel`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: uploadID }),
      }).catch(() => {});
    }
  }
}

async function uploadPluginChunk(serverUrl, headers, uploadID, index, buffer) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const form = new FormData();
      form.append("upload_id", uploadID);
      form.append("chunk_index", String(index));
      form.append("chunk_data", new Blob([buffer]), `chunk-${index}`);
      const response = await fetch(`${serverUrl}/api/admin/upload/chunk`, {
        method: "POST",
        headers,
        body: form,
      });
      const body = await readResponse(response);
      if (!response.ok || !body || body.status !== "success") {
        throw new Error(`chunk ${index} upload failed (${response.status}): ${formatBody(body)}`);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function packAndInstall(project, options = {}) {
  const archivePath = await packProject(project);
  return installProject(project, { ...options, archivePath });
}

async function getPluginLogs(project, options = {}) {
  const serverUrl = normalizeServerUrl(options.serverUrl || project.serverUrl);
  const apiKey = options.apiKey || project.apiKey;
  if (!serverUrl) throw new Error("Komari server URL is required; use --server or KOMARI_SERVER_URL");
  if (!apiKey) throw new Error("Komari API Key is required; use --api-key or KOMARI_API_KEY");
  const result = await rpcCall(serverUrl, apiKey, "admin:getPluginLogs", {
    short: project.manifest.short,
  });
  return result && typeof result.logs === "string" ? result.logs : "";
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

module.exports = { getPluginLogs, installProject, packAndInstall };
