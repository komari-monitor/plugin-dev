"use strict";

const path = require("node:path");
const { buildProject } = require("./build");
const { assertProject, checkProject } = require("./check");
const { installProject, packAndInstall } = require("./install");
const { loadProject } = require("./project");
const { packProject } = require("./pack");

async function main(argv) {
  const { command, options } = parseArgs(argv);
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const project = loadProject(options.cwd || process.cwd());
  switch (command) {
    case "check":
      runCheck(project);
      return;
    case "build":
      await buildProject(project);
      return;
    case "pack":
      await packProject(project);
      console.log(`Packed ${project.archive}`);
      return;
    case "install":
      assertProject(project, { allowMissingEntry: true });
      await buildProject(project);
      await packProject(project);
      printInstall(await installProject(project, { ...options, enable: options.enable === true }));
      return;
    case "dev":
      await dev(project, options);
      return;
    default:
      throw new Error(`unknown command ${command}; run komari-plugin-dev help`);
  }
}

function runCheck(project) {
  const errors = checkProject(project, { allowMissingEntry: true });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`OK ${project.manifest.short}: manifest and package files are valid`);
}

async function dev(project, options) {
  const cycle = async () => {
    await buildProject(project);
    const result = await packAndInstall(project, { ...options, enable: true });
    printInstall(result);
  };

  try {
    await cycle();
  } catch (error) {
    console.error(`[dev] ${error.message}`);
    if (options.once) throw error;
  }
  if (options.once) return;

  let running = false;
  let queued = false;
  const trigger = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await cycle();
    } catch (error) {
      console.error(`[dev] ${error.message}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void trigger();
      }
    }
  };

  let chokidar;
  try {
    chokidar = require("chokidar");
  } catch {
    throw new Error("chokidar is required for dev mode; run npm install in the plugin project");
  }
  const watchTargets = [
    path.dirname(path.join(project.root, project.source)),
    path.join(project.root, "komari-plugin.json"),
    path.join(project.root, "komari.config.json"),
    ...(project.config.files || []).map((file) => path.join(project.root, file)),
    ...(project.config.assets || []).map((file) => path.join(project.root, file)),
  ];
  const inside = (candidate, parent) => candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
  const outputRoot = path.resolve(project.root, project.outputDir);
  const nodeModulesRoot = path.resolve(project.root, "node_modules");
  const archivePath = path.resolve(project.root, project.archive);
  const ignored = (candidate) => {
    const normalized = path.resolve(candidate);
    return inside(normalized, outputRoot) ||
      inside(normalized, nodeModulesRoot) ||
      normalized.includes(`${path.sep}.git${path.sep}`) ||
      normalized === archivePath;
  };
  const watcher = chokidar.watch([...new Set(watchTargets)], { ignored, ignoreInitial: true });
  watcher.on("all", (_event, file) => {
    console.log(`[dev] changed ${path.relative(project.root, file)}`);
    void trigger();
  });
  console.log(`[dev] watching ${project.root}`);

  await new Promise((resolve) => {
    const stop = async () => {
      await watcher.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function printInstall(result) {
  const plugin = result.plugin;
  if (!plugin) {
    console.log(`[dev] uploaded ${result.short}; plugin status is unavailable`);
    return;
  }
  console.log(`[dev] ${result.short}: enabled=${Boolean(plugin.enabled)} running=${Boolean(plugin.running)}`);
  if (plugin.last_error) console.error(`[dev] last_error: ${plugin.last_error}`);
  if (result.enable && result.enable.requires_approval) {
    console.log("[dev] permissions require approval; approve them in Komari before continuing");
  }
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv.shift() : "help";
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") options.once = true;
    else if (arg === "--approved") options.approved = true;
    else if (arg === "--enable") options.enable = true;
    else if (arg === "--server") options.serverUrl = requireOptionValue(argv, ++index, arg);
    else if (arg === "--api-key") options.apiKey = requireOptionValue(argv, ++index, arg);
    else if (arg === "--cwd") options.cwd = requireOptionValue(argv, ++index, arg);
    else throw new Error(`unknown option ${arg}`);
  }
  return { command, options };
}

function requireOptionValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("-")) throw new Error(`${option} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Komari plugin development tools

Usage:
  komari-plugin-dev check
  komari-plugin-dev build
  komari-plugin-dev pack
  komari-plugin-dev install [--server URL] [--api-key KEY] [--enable] [--approved]
  komari-plugin-dev dev [--server URL] [--api-key KEY] [--once] [--approved]

Connection settings are read from command-line options, KOMARI_SERVER_URL /
KOMARI_API_KEY, or the gitignored komari.local.json file.
`);
}

module.exports = { main };
