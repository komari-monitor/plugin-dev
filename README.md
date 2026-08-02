# @komari-monitor/plugin-dev

Build and install tools for Komari plugin projects.

The package is intended to be used through npm scripts in a generated plugin
project. It does not require a globally installed Komari CLI.

```json
{
  "scripts": {
    "check": "komari-plugin-dev check",
    "build": "komari-plugin-dev build",
    "pack": "komari-plugin-dev pack",
    "plugin:install": "komari-plugin-dev install --enable",
    "dev": "komari-plugin-dev dev"
  },
  "komari": {
    "source": "src/plugin.ts",
    "files": ["pages/dist"]
  }
}
```

The manifest entry is built with esbuild as an IIFE, while `server` remains an
external CommonJS module supplied by Komari.

Connection settings can be supplied without putting credentials in the
manifest:

```json
{
  "serverUrl": "http://127.0.0.1:25774",
  "apiKey": "...",
  "language": "en"
}
```

Save that as `komari.local.json` and add it to `.gitignore`, or use
`KOMARI_SERVER_URL` and `KOMARI_API_KEY` environment variables.

`dev` reuses Komari's existing `POST /api/admin/plugin/install` endpoint. A
running plugin is unloaded, replaced, and loaded again by the server, so the
plugin's enabled state and persistent storage are preserved. `dev` also asks
the server to enable the plugin after the first install; use `--approved` when
the manifest requests permissions that require approval. `install` only
enables the plugin when passed `--enable`.

`dev` follows the plugin's runtime log buffer through the existing
`admin:getPluginLogs` RPC and prints new lines as they arrive. It polls every
500 ms by default; use `--no-logs` to disable following or
`--log-interval 1000` to change the interval. The server only keeps a bounded
buffer, so this is intended for development feedback rather than permanent
log storage.

The CLI supports Chinese and English. Set `--lang zh-CN` or `--lang en`, or set
`KOMARI_LANG`. Generated projects store the selected language in
`komari.local.json`.

Repository: https://github.com/komari-monitor/plugin-dev
