"use strict";

let validateManifest;
try {
  ({ validateManifest } = require("@komari-monitor/plugin-sdk"));
} catch {
  ({ validateManifest } = require("../../plugin-sdk/src"));
}
const { fileExists } = require("./project");

function checkProject(project, options = {}) {
  const errors = validateManifest(project.manifest);
  const manifest = project.manifest;
  const entry = manifest.entry || "script.js";

  if (!options.allowMissingEntry) checkFile(errors, project.root, entry, "entry");
  if (!options.allowMissingPackageFiles) {
    if (manifest.icon) checkFile(errors, project.root, manifest.icon, "icon");
    for (const [index, page] of (manifest.pages || []).entries()) {
      if ((page.type || "iframe") === "iframe" && page.file) {
        checkFile(errors, project.root, page.file, `pages[${index}].file`);
      }
      if (page.icon) checkFile(errors, project.root, page.icon, `pages[${index}].icon`);
    }
  }

  if (!project.source) {
    errors.push("source file is required");
  } else {
    checkFile(errors, project.root, project.source, "source");
  }
  if (project.config.files !== undefined && !Array.isArray(project.config.files)) {
    errors.push("komari.files must be an array");
  }
  if (project.config.assets !== undefined && !Array.isArray(project.config.assets)) {
    errors.push("komari.assets must be an array");
  }
  if (project.config.external !== undefined && !Array.isArray(project.config.external)) {
    errors.push("komari.external must be an array");
  }

  for (const [key, label] of [["files", "komari.files"], ["assets", "komari.assets"]]) {
    const values = project.config[key];
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      const itemLabel = `${label}[${index}]`;
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`${itemLabel} must be a non-empty relative path`);
        return;
      }
      if (!options.allowMissingPackageFiles) checkFile(errors, project.root, value, itemLabel);
    });
  }

  if (Array.isArray(project.config.external)) {
    project.config.external.forEach((value, index) => {
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`komari.external[${index}] must be a non-empty package name`);
      }
    });
  }

  return [...new Set(errors)];
}

function checkFile(errors, root, relative, label) {
  try {
    if (!fileExists(root, relative)) errors.push(`${label} does not exist: ${relative}`);
  } catch (error) {
    errors.push(`${label} is invalid: ${error.message}`);
  }
}

function assertProject(project, options) {
  const errors = checkProject(project, options);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return project;
}

module.exports = { assertProject, checkProject };
