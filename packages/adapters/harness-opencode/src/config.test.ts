import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  batchToolCallsLine,
  opencodeConfig,
  opencodeInstructionsText,
  opencodeModelCatalog,
  opencodeUpdatePolicyText,
} from "./config.ts";

const model = "deepseek/deepseek-v4.1-flash-1017";
const files = { instructionsFile: "/run/tmp/halonic-instructions.md" };
const tokenHeader = { "x-halonic-run-token": "{env:HALONIC_RUN_TOKEN}" };

verifies("harness-opencode.config", () => {
  describe("opencodeConfig", () => {
    const config = opencodeConfig({ url: "http://127.0.0.1:4100/" }, { model }, files);

    it("points the model, small model and MCP server at the bridge, with the token's header by name", () => {
      expect(config).toMatchObject({
        model: `anthropic/${model}`,
        small_model: `anthropic/${model}`,
        providers: {
          anthropic: {
            settings: { baseURL: "http://127.0.0.1:4100/v1", headers: tokenHeader },
            models: { [model]: { limit: { output: 32_000 } } },
          },
        },
        mcp: {
          halonic: { type: "remote", url: "http://127.0.0.1:4100/mcp", headers: tokenHeader },
        },
      });
    });

    it("turns its own network features off and reads only the session's instructions", () => {
      expect(config).toMatchObject({
        update: "disable",
        share: "disabled",
        snapshots: false,
        plugins: [],
        lsp: false,
        formatter: false,
        instructions: [files.instructionsFile],
      });
    });

    it("allows every tool but the fixed deny list", () => {
      const denied = [
        "webfetch",
        "websearch",
        "question",
        "subagent",
        "skill",
        "execute",
        "experimental_image_generate",
        "external_directory",
      ];
      expect(config["permissions"]).toEqual([
        { action: "*", resource: "*", effect: "allow" },
        ...denied.map((action) => ({ action, resource: "*", effect: "deny" })),
      ]);
    });

    it("takes the alias's output limit", () => {
      const limited = opencodeConfig({ url: "http://b" }, { model, maxOutputTokens: 8000 }, files);
      expect(JSON.stringify(limited)).toContain('"limit":{"output":8000}');
    });

    it("refuses a task without a model", () => {
      expect(() => opencodeConfig({ url: "http://b" }, {}, files)).toThrow("names none");
    });

    it("refuses a model name OpenCode would expand, or that isn't plain", () => {
      const crafted = [
        "x{env:HALONIC_RUN_TOKEN}",
        "x{file:../../.netrc}",
        "/deepseek",
        "deepseek/",
        "deepseek//flash",
        "-flash",
        "deep seek",
        "$HOME",
        "a".repeat(129),
      ];
      for (const name of crafted) {
        expect(() => opencodeConfig({ url: "http://b" }, { model: name }, files)).toThrow(
          "plain model name",
        );
        expect(() => opencodeModelCatalog({ model: name })).toThrow("plain model name");
      }
    });

    it("keeps OpenRouter's ids with a /, and names with . _ : -", () => {
      for (const name of [model, "claude-sonnet-5-5", "org/model_v2:free"]) {
        expect(opencodeConfig({ url: "http://b" }, { model: name }, files)["model"]).toBe(
          `anthropic/${name}`,
        );
      }
    });
  });

  describe("opencodeModelCatalog", () => {
    it("holds only the bridge's provider with the agent's model, priced at 0", () => {
      const catalog = opencodeModelCatalog({ model, maxOutputTokens: 8000 });
      expect(Object.keys(catalog)).toEqual(["anthropic"]);
      expect(catalog).toMatchObject({
        anthropic: {
          models: {
            [model]: { id: model, cost: { input: 0, output: 0 }, limit: { output: 8000 } },
          },
        },
      });
    });
  });

  describe("opencodeUpdatePolicyText", () => {
    it("holds only the update policy, as 2.3.0's update check reads it", () => {
      expect(JSON.parse(opencodeUpdatePolicyText())).toEqual({ update: "disable" });
    });
  });

  describe("opencodeInstructionsText", () => {
    it("puts the fixed line in front of the agent's instructions", () => {
      expect(opencodeInstructionsText({ instructions: "  Review the change.\n" })).toBe(
        `${batchToolCallsLine}\n\nReview the change.\n`,
      );
      expect(opencodeInstructionsText({ instructions: " " })).toBe(`${batchToolCallsLine}\n`);
    });
  });
});
