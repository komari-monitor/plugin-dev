#!/usr/bin/env node

"use strict";

require("../src/cli").main(process.argv.slice(2)).catch((error) => {
  console.error(`komari-plugin-dev: ${error.message}`);
  if (process.env.KOMARI_PLUGIN_DEV_DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
