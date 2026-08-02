"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProject } = require("../src/project");
const { checkProject } = require("../src/check");

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
