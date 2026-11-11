import type { HarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexConfigArgs, codexConfigText, codexOwnSandboxArgs, tomlString } from "./config.ts";

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

/** The lines of the settings that set `key`, outside comments. */
function settingLines(key: string): string[] {
  return codexConfigText()
    .split("\n")
    .filter((line) => line.startsWith(`${key} =`));
}

verifies("harness-codex.config", () => {
  describe("codexOwnSandboxArgs", () => {
    it("turns Codex's own sandbox on for one process, with the commands' writes kept to the working folder", () => {
      expect(codexOwnSandboxArgs).toEqual(["-c", 'sandbox_mode="workspace-write"']);
      expect(codexConfigText()).toContain('sandbox_mode = "danger-full-access"');
    });
  });

  describe("codexConfigText", () => {
    // Checked by hand against Codex 0.166.0: `config/read` gives back each
    // of these values, and a turn reaches the bridge with the token header.
    it("points Codex at the bridge, with its own sandbox and web search off", () => {
      expect(codexConfigText()).toBe(
        [
          "# Written by Halonic before each run of this agent. Changes here are replaced.",
          'model_provider = "halonic"',
          'sandbox_mode = "danger-full-access"',
          'approval_policy = "on-request"',
          'web_search = "disabled"',
          "",
          "[model_providers.halonic]",
          'name = "Halonic bridge"',
          'wire_api = "responses"',
          "requires_openai_auth = true",
          'env_http_headers = { "x-halonic-run-token" = "HALONIC_RUN_TOKEN" }',
          "",
          "[mcp_servers.halonic]",
          'env_http_headers = { "x-halonic-run-token" = "HALONIC_RUN_TOKEN" }',
          "",
        ].join("\n"),
      );
    });

    it("turns web search off once, at the top, where no table can hide it", () => {
      expect(settingLines("web_search")).toEqual(['web_search = "disabled"']);
      expect(codexConfigText().indexOf("web_search")).toBeLessThan(codexConfigText().indexOf("["));
    });

    it("holds no address and no token, so it is the same for every run", () => {
      expect(codexConfigText()).toBe(codexConfigText());
      expect(codexConfigText()).not.toContain("127.0.0.1");
      expect(codexConfigText()).not.toContain(bridge.token);
    });
  });

  describe("codexConfigArgs", () => {
    it("gives the bridge's addresses for the model provider and the MCP server", () => {
      expect(codexConfigArgs(bridge)).toEqual([
        "-c",
        'model_providers.halonic.base_url="http://127.0.0.1:4100/v1"',
        "-c",
        'mcp_servers.halonic.url="http://127.0.0.1:4100/mcp"',
      ]);
    });

    it("gives the same addresses when the bridge's ends with a slash", () => {
      expect(codexConfigArgs({ url: "http://127.0.0.1:4100/" })).toEqual(codexConfigArgs(bridge));
    });

    it("never holds the token", () => {
      expect(codexConfigArgs(bridge).join(" ")).not.toContain(bridge.token);
    });
  });

  describe("tomlString", () => {
    it("quotes a string, escaping what TOML can't hold as it is", () => {
      expect(tomlString('say "hi"\\\n\t\u0001\u007f')).toBe(
        '"say \\"hi\\"\\\\\\n\\t\\u0001\\u007F"',
      );
    });

    it("keeps other characters as they are", () => {
      expect(tomlString("café ☕ 𝄞")).toBe('"café ☕ 𝄞"');
    });

    it("refuses half of a surrogate pair", () => {
      expect(() => tomlString("\ud800")).toThrow("half of a surrogate pair");
    });
  });
});
