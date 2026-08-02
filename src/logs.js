"use strict";

const { getPluginLogs } = require("./install");

const DEFAULT_LOG_INTERVAL = 500;

function logDelta(previous, current) {
  if (!previous) return current;
  if (current.startsWith(previous)) return current.slice(previous.length);
  // A plugin reload resets the server-side ring buffer. Treat a shorter
  // response as a fresh stream so startup logs are visible immediately.
  if (current.length < previous.length) return current;

  // If the bounded buffer dropped old bytes, skip the part already seen.
  const maxOverlap = Math.min(previous.length, current.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (previous.endsWith(current.slice(0, overlap))) return current.slice(overlap);
  }
  return current;
}

function normalizeInterval(value) {
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval < 100) return DEFAULT_LOG_INTERVAL;
  return Math.min(Math.floor(interval), 60_000);
}

async function readPluginLogDelta(project, options, state) {
  const current = await getPluginLogs(project, options);
  const delta = logDelta(state.value, current);
  state.value = current;
  return delta;
}

function printLogLines(text, write, format = (line) => line) {
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    if (line) write(format(line));
  }
}

module.exports = { DEFAULT_LOG_INTERVAL, logDelta, normalizeInterval, printLogLines, readPluginLogDelta };
