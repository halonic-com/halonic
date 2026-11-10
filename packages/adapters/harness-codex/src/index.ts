// The public API of @halonicjs/adapter-harness-codex. Everything else in src/ is internal.
// `start` comes with the app-server client (build plan D2 and D3); until then
// the parts are exported on their own.
export { codexProgram, detectCodex, oldestSupportedVersion, supportedVersions } from "./detect.ts";
export { type CodexFolders, codexEnvironment, codexRunTokenVariable } from "./environment.ts";
