"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProject } = require("../src/project");
const { checkProject } = require("../src/check");
const { getPluginLogs } = require("../src/install");
const { logDelta, normalizeInterval, printLogLines } = require("../src/logs");
const { parseArgs } = require("../src/cli");

test("check validates a minimal plugin project", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "komari-plugin-dev-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "komari-plugin.json"), JSON.stringify({ name: "Demo", short: "demo", entry: "script.js" }));
  fs.writeFileSync(path.join(root, "src", "plugin.js"), "function load() {}\n");
  fs.writeFileSync(path.join(root, "script.js"), "function load() {}\n");
  const project = loadProject(root);
  assert.deepEqual(checkProject(project), []);
});

test("check allows the build output to be absent during build", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "komari-plugin-dev-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "komari-plugin.json"), JSON.stringify({ name: "Demo", short: "demo" }));
  fs.writeFileSync(path.join(root, "src", "plugin.js"), "function load() {}\n");
  const project = loadProject(root);
  assert.deepEqual(checkProject(project, { allowMissingEntry: true, allowMissingPackageFiles: true }), []);
});

test("dev arguments support language and realtime log options", () => {
  assert.deepEqual(parseArgs(["dev", "--lang", "en", "--log-interval", "250", "--no-logs"]), {
    command: "dev",
    options: { lang: "en", logInterval: "250", logs: false },
  });
  assert.equal(normalizeInterval("250"), 250);
  assert.equal(normalizeInterval("20"), 500);
});

test("plugin-dev accepts --help with a selected language", () => {
  assert.deepEqual(parseArgs(["--help", "--lang", "en"]), {
    command: "help",
    options: { help: true, lang: "en" },
  });
});

test("logDelta only returns new output and handles a reset buffer", () => {
  assert.equal(logDelta("one\ntwo\n", "one\ntwo\nthree\n"), "three\n");
  assert.equal(logDelta("old output\n", "[plugin] loading demo\n"), "[plugin] loading demo\n");
  const lines = [];
  printLogLines("one\n\ntwo\n", lines.push.bind(lines), (line) => `[${line}]`);
  assert.deepEqual(lines, ["[one]", "[two]"]);
});

test("getPluginLogs calls the typed admin RPC endpoint", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, init) => {
    request = { url, init };
    return {
      ok: true,
      async text() {
        return JSON.stringify({ result: { logs: "hello\n" } });
      },
    };
  };
  try {
    const logs = await getPluginLogs({
      serverUrl: "http://localhost:25774",
      apiKey: "secret",
      manifest: { short: "demo" },
    });
    assert.equal(logs, "hello\n");
    assert.equal(request.url, "http://localhost:25774/api/rpc2");
    assert.equal(request.init.headers.Authorization, "Bearer secret");
    assert.deepEqual(JSON.parse(request.init.body).params, { short: "demo" });
  } finally {
    global.fetch = originalFetch;
  }
});
