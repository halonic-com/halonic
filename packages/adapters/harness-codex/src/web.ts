// The Codex harness's Web-only entry point, for a runtime without Node such
// as the Cloudflare Worker. Everything it exports, and everything it
// imports, uses only Web-standard APIs; `web-imports.test.ts` in the harness
// kit keeps it that way.

export type {
  HostPaths,
  OwnSandboxCheck,
  SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit/web";
export { type CodexWebHarnessOptions, codexWebHarness } from "./web-harness.ts";
