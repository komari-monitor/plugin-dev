"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertProject } = require("./check");
const { resolveLocal } = require("./project");

async function buildProject(project) {
  assertProject(project, { allowMissingEntry: true, allowMissingPackageFiles: true });
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch {
    throw new Error("esbuild is required; run npm install in the plugin project");
  }

  const source = resolveLocal(project.root, project.source);
  const output = resolveLocal(project.root, project.entry);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  await esbuild.build({
    absWorkingDir: project.root,
    bundle: true,
    entryPoints: [source],
    external: ["server", ...(project.config.external || [])],
    format: "iife",
    legalComments: "eof",
    logLevel: "info",
    outfile: output,
    platform: "node",
    sourcemap: project.config.sourcemap ? "external" : false,
    target: project.config.target || "es2020",
  });
  return output;
}

module.exports = { buildProject };
