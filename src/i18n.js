"use strict";

const LOCALES = {
  "zh-CN": {
    checkOk: (short) => `OK ${short}: manifest and package files are valid`,
    packed: (archive) => `已打包 ${archive}`,
    uploadedUnavailable: (short) => `[dev] 已上传 ${short}；无法获取插件状态`,
    status: (short, enabled, running) => `[dev] ${short}: enabled=${enabled} running=${running}`,
    lastError: (error) => `[dev] last_error: ${error}`,
    approval: "[dev] 插件权限需要批准；请先在 Komari 中批准后再继续",
    changed: (file) => `[dev] 已变更 ${file}`,
    watching: (root) => `[dev] 正在监听 ${root}`,
    log: (line) => `[dev:log] ${line}`,
    logFollowError: (error) => `[dev] 无法获取插件日志：${error}`,
    helpTitle: "Komari 插件开发工具",
    helpUsage: "用法:",
    helpInstall: "  komari-plugin-dev install [--server URL] [--api-key KEY] [--enable] [--approved]",
    helpDev: "  komari-plugin-dev dev [--server URL] [--api-key KEY] [--once] [--approved] [--no-logs] [--lang zh-CN|en]",
    helpConnection: "连接配置读取顺序：命令行选项、KOMARI_SERVER_URL / KOMARI_API_KEY，或被 Git 忽略的 komari.local.json。",
    helpLanguage: "语言可以通过 --lang 或 KOMARI_LANG 设置；支持 zh-CN 和 en。dev 默认每 500ms 增量回传插件日志，可使用 --no-logs 关闭。",
  },
  en: {
    checkOk: (short) => `OK ${short}: manifest and package files are valid`,
    packed: (archive) => `Packed ${archive}`,
    uploadedUnavailable: (short) => `[dev] uploaded ${short}; plugin status is unavailable`,
    status: (short, enabled, running) => `[dev] ${short}: enabled=${enabled} running=${running}`,
    lastError: (error) => `[dev] last_error: ${error}`,
    approval: "[dev] plugin permissions require approval; approve them in Komari before continuing",
    changed: (file) => `[dev] changed ${file}`,
    watching: (root) => `[dev] watching ${root}`,
    log: (line) => `[dev:log] ${line}`,
    logFollowError: (error) => `[dev] unable to read plugin logs: ${error}`,
    helpTitle: "Komari plugin development tools",
    helpUsage: "Usage:",
    helpInstall: "  komari-plugin-dev install [--server URL] [--api-key KEY] [--enable] [--approved]",
    helpDev: "  komari-plugin-dev dev [--server URL] [--api-key KEY] [--once] [--approved] [--no-logs] [--lang zh-CN|en]",
    helpConnection: "Connection settings are read from command-line options, KOMARI_SERVER_URL / KOMARI_API_KEY, or the gitignored komari.local.json.",
    helpLanguage: "Set the language with --lang or KOMARI_LANG. Supported languages are zh-CN and en. dev follows plugin logs incrementally every 500ms by default; use --no-logs to disable it.",
  },
};

function localeFrom(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

function resolveLocale(explicit, env = process.env, systemLocale = detectSystemLocale()) {
  const candidate = explicit ?? env.KOMARI_LANG ?? env.LC_ALL ?? env.LANGUAGE ?? env.LANG ?? systemLocale;
  const locale = localeFrom(candidate);
  if (locale) return locale;
  if (explicit !== undefined) {
    throw new Error(`unsupported language "${explicit}"; use zh-CN or en`);
  }
  return "en";
}

function detectSystemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en";
  }
}

function getMessages(locale) {
  return LOCALES[locale] || LOCALES.en;
}

module.exports = { getMessages, localeFrom, resolveLocale };
