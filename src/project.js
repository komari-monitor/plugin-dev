"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${path.basename(file)}: ${error.message}`);
  }
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadProject(root = process.cwd()) {
  root = path.resolve(root);
  const manifestFile = path.join(root, "komari-plugin.json");
  if (!fs.existsSync(manifestFile)) {
    throw new Error("komari-plugin.json was not found; run this command from a plugin project");
  }

  const packageFile = path.join(root, "package.json");
  const devFile = path.join(root, "komari.config.json");
  const localFile = path.join(root, "komari.local.json");
  const packageJson = fs.existsSync(packageFile) ? readJson(packageFile) : {};
  const manifest = readJson(manifestFile);
  const packageConfig = packageJson.komari || {};
  const devConfig = fs.existsSync(devFile) ? readJson(devFile) : {};
  const localConfig = fs.existsSync(localFile) ? readJson(localFile) : {};
  const env = {
    ...loadDotEnv(path.join(root, ".env.local")),
    ...process.env,
  };

  const config = { ...devConfig, ...packageConfig };
  const entry = manifest.entry || config.output || "script.js";
  const source = config.source || findSource(root, entry);
  const outputDir = config.outputDir || "dist";
  const archive = config.archive || path.join(outputDir, `${manifest.short}-${manifest.version || "dev"}.zip`);
  const serverUrl = env.KOMARI_SERVER_URL || localConfig.serverUrl || config.serverUrl;
  const apiKey = env.KOMARI_API_KEY || localConfig.apiKey;

  return {
    root,
    manifest,
    manifestFile,
    packageJson,
    config,
    localConfig,
    entry,
    source,
    outputDir,
    archive,
    serverUrl,
    apiKey,
  };
}

function findSource(root, entry) {
  const candidates = [
    "src/plugin.ts",
    "src/plugin.tsx",
    "src/plugin.js",
    "src/plugin.jsx",
    entry,
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate))) || "src/plugin.ts";
}

function resolveLocal(root, value) {
  const full = path.resolve(root, value);
  const relative = path.relative(root, full);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path must stay inside the project: ${value}`);
  }
  return full;
}

function relativeName(root, full) {
  return path.relative(root, full).split(path.sep).join("/");
}

function fileExists(root, relative) {
  return fs.existsSync(resolveLocal(root, relative));
}

function walkFiles(root, relative) {
  const full = resolveLocal(root, relative);
  if (!fs.existsSync(full)) return [];
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed in plugin packages: ${relative}`);
  if (stat.isFile()) return [full];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const name of fs.readdirSync(full)) {
    files.push(...walkFiles(root, path.join(relative, name)));
  }
  return files;
}

module.exports = { fileExists, loadProject, relativeName, resolveLocal, walkFiles };
