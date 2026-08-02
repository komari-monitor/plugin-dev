"use strict";

const path = require("node:path");
const { buildProject } = require("./build");
const { assertProject, checkProject } = require("./check");
const { installProject, packAndInstall } = require("./install");
const { getMessages, resolveLocale } = require("./i18n");
const { normalizeInterval, printLogLines, readPluginLogDelta } = require("./logs");
const { loadProject } = require("./project");
const { packProject } = require("./pack");

async function main(argv) {
  const { command, options } = parseArgs(argv);
  if (command === "help" || command === "--help" || command === "-h" || options.help) {
    printHelp(options.lang);
    return;
  }

  const project = loadProject(options.cwd || process.cwd());
  const text = getMessages(options.lang ? resolveLocale(options.lang) : project.locale);
  switch (command) {
    case "check":
      runCheck(project, text);
      return;
    case "build":
      await buildProject(project);
      return;
    case "pack":
      await packProject(project);
      console.log(text.packed(project.archive));
      return;
    case "install":
      assertProject(project, { allowMissingEntry: true });
      await buildProject(project);
      await packProject(project);
      printInstall(await installProject(project, { ...options, enable: options.enable === true }), text);
      return;
    case "dev":
      await dev(project, options, text);
      return;
    default:
      throw new Error(`unknown command ${command}; run komari-plugin-dev help`);
  }
}

function runCheck(project, text) {
  const errors = checkProject(project, { allowMissingEntry: true });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(text.checkOk(project.manifest.short));
}

async function dev(project, options, text) {
  const logState = { value: "" };
  const logInterval = normalizeInterval(options.logInterval);
  let logsReady = false;
  let logPolling = false;
  let logTimer;
  let lastLogError = "";

  const cycle = async () => {
    await buildProject(project);
    const result = await packAndInstall(project, { ...options, enable: true });
    printInstall(result, text);
    logsReady = options.logs !== false;
    logState.value = "";
    lastLogError = "";
  };

  const pollLogs = async () => {
    if (!logsReady || logPolling) return;
    logPolling = true;
    try {
      const delta = await readPluginLogDelta(project, options, logState);
      printLogLines(delta, (line) => console.log(text.log(line)));
      lastLogError = "";
    } catch (error) {
      if (error.message !== lastLogError) {
        console.error(text.logFollowError(error.message));
        lastLogError = error.message;
      }
    } finally {
      logPolling = false;
    }
  };

  const ensureLogTimer = () => {
    if (options.logs === false || logTimer || !logsReady) return;
    logTimer = setInterval(() => void pollLogs(), logInterval);
  };

  try {
    await cycle();
  } catch (error) {
    console.error(`[dev] ${error.message}`);
    if (options.once) throw error;
  }
  if (options.once) {
    await pollLogs();
    return;
  }
  await pollLogs();
  ensureLogTimer();

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
      await pollLogs();
      ensureLogTimer();
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
    console.log(text.changed(path.relative(project.root, file)));
    void trigger();
  });
  console.log(text.watching(project.root));

  await new Promise((resolve) => {
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      if (logTimer) clearInterval(logTimer);
      await watcher.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function printInstall(result, text = getMessages("en")) {
  const plugin = result.plugin;
  if (!plugin) {
    console.log(text.uploadedUnavailable(result.short));
    return;
  }
  console.log(text.status(result.short, Boolean(plugin.enabled), Boolean(plugin.running)));
  if (plugin.last_error) console.error(text.lastError(plugin.last_error));
  if (result.enable && result.enable.requires_approval) {
    console.log(text.approval);
  }
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv.shift() : "help";
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--once") options.once = true;
    else if (arg === "--approved") options.approved = true;
    else if (arg === "--enable") options.enable = true;
    else if (arg === "--no-logs") options.logs = false;
    else if (arg === "--logs") options.logs = true;
    else if (arg === "--log-interval") options.logInterval = requireOptionValue(argv, ++index, arg);
    else if (arg === "--lang" || arg === "--language") options.lang = requireOptionValue(argv, ++index, arg);
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

function printHelp(locale) {
  const text = getMessages(locale ? resolveLocale(locale) : resolveLocale());
  console.log(`${text.helpTitle}

${text.helpUsage}
  komari-plugin-dev check
  komari-plugin-dev build
  komari-plugin-dev pack
${text.helpInstall}
${text.helpDev}

${text.helpConnection}
${text.helpLanguage}
`);
}

module.exports = { main, parseArgs };
