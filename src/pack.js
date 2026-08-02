"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertProject } = require("./check");
const { relativeName, resolveLocal, walkFiles } = require("./project");

async function packProject(project) {
  assertProject(project);
  let archiver;
  try {
    archiver = require("archiver");
  } catch {
    throw new Error("archiver is required for packaging; run npm install in the plugin project");
  }
  const archivePath = resolveLocal(project.root, project.archive);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });

  const files = new Map();
  addPath(files, project, "komari-plugin.json");
  addPath(files, project, project.entry);
  if (project.manifest.icon) addPath(files, project, project.manifest.icon);
  for (const page of project.manifest.pages || []) {
    if ((page.type || "iframe") === "iframe" && page.file) {
      const pagePath = path.dirname(page.file) === "." ? page.file : path.dirname(page.file);
      addPath(files, project, pagePath);
    }
    if (page.icon) addPath(files, project, page.icon);
  }
  for (const relative of [...(project.config.files || []), ...(project.config.assets || [])]) {
    addPath(files, project, relative);
  }

  const output = fs.createWriteStream(archivePath);
  const zip = archiver("zip", { zlib: { level: 9 } });
  const close = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
  });
  zip.pipe(output);
  for (const [name, full] of files) {
    if (path.resolve(full) === path.resolve(archivePath)) continue;
    zip.append(fs.createReadStream(full), { name });
  }
  await zip.finalize();
  await close;
  return archivePath;
}

function addPath(files, project, relative) {
  if (!relative) return;
  if (relative === ".") throw new Error("package paths cannot be the project root");
  const full = resolveLocal(project.root, relative);
  for (const file of walkFiles(project.root, relative)) {
    files.set(relativeName(project.root, file), file);
  }
  if (!fs.existsSync(full)) throw new Error(`package file does not exist: ${relative}`);
}

module.exports = { packProject };
