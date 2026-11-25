import { type HarnessBridge, type HarnessTask, harnessBridgeTokenHeader } from "@halonicjs/ports";
import type { OpenCodeFiles } from "./files.ts";

/**
 * The variable that carries the run token. The config names it as
 * `{env:HALONIC_RUN_TOKEN}`, which OpenCode fills in when it reads the
 * config, so the token is never written into the config or a file.
 */
export const opencodeRunTokenVariable = "HALONIC_RUN_TOKEN";

/** The provider OpenCode calls: the Anthropic-style one, pointed at the bridge. */
export const bridgeProviderId = "anthropic";

/** The name of the bridge's MCP server in OpenCode's config. */
export const bridgeServerName = "halonic";

/** The output limit when the alias sets none: the trial's, not OpenCode's own 256,000. */
export const defaultMaxOutputTokens = 32_000;

/**
 * The context window the catalog gives the model. The bridge, not
 * OpenCode, enforces limits; this only tells OpenCode when to compact.
 */
export const catalogContextTokens = 128_000;

/**
 * OpenCode's tools that no Halonic agent gets, whatever its file says
 * (requirement `harness-opencode.config`). A deny rule with resource `*` also
 * takes the tool out of what the model is sent.
 *
 * - `webfetch` and `websearch`: the web only through Halonic's tools (decision 7, HAL-2076).
 * - `question`: nobody answers in `run` mode.
 * - `subagent`, `skill`: not pinned by Halonic yet.
 * - `execute`: Code Mode can reach tools that aren't on the list.
 * - `experimental_image_generate`: calls a provider out of the bridge's sight.
 * - `external_directory`: the fence enforces it anyway.
 */
export const deniedTools: readonly string[] = [
  "webfetch",
  "websearch",
  "question",
  "subagent",
  "skill",
  "execute",
  "experimental_image_generate",
  "external_directory",
];

/**
 * The line put in front of the agent's instructions, as harness parity with
 * Claude Code's own prompt (docs/adr/2026-11-24-opencode-harness-program.md).
 */
export const batchToolCallsLine =
  "Work in few steps. When several tool calls don't depend on each other (reads, searches), make them all in the same step, in parallel.";

/**
 * OpenCode's config for one run, given to it as `OPENCODE_CONFIG_CONTENT`
 * (requirement `harness-opencode.config`):
 *
 * - The model, its small model and its provider are the agent's model
 *   through the bridge's Anthropic-style route, with the run token's header
 *   read from {@link opencodeRunTokenVariable}. The bridge refuses any other
 *   model, so titles and compaction use the agent's model too.
 * - The output limit is the alias's, or {@link defaultMaxOutputTokens}.
 * - Every network feature of its own is off: updates, sharing, snapshots,
 *   plugins, LSP and formatters (they download servers).
 * - Everything is allowed but {@link deniedTools}; Halonic's fence and the
 *   bridge's approvals do the rest.
 * - Its only instructions file is the session's, and its only MCP server is
 *   the bridge's.
 *
 * It holds the bridge's address but no secret.
 *
 * @throws Error when the task names no model: OpenCode has no default the bridge serves
 */
export function opencodeConfig(
  bridge: Pick<HarnessBridge, "url">,
  task: Pick<HarnessTask, "model" | "maxOutputTokens">,
  files: Pick<OpenCodeFiles, "instructionsFile">,
): Record<string, unknown> {
  const model = requireModel(task);
  const address = bridge.url.replace(/\/+$/, "");
  const tokenHeader = { [harnessBridgeTokenHeader]: `{env:${opencodeRunTokenVariable}}` };
  return {
    model: `${bridgeProviderId}/${model}`,
    small_model: `${bridgeProviderId}/${model}`,
    update: "disable",
    share: "disabled",
    snapshots: false,
    plugins: [],
    lsp: false,
    formatter: false,
    instructions: [files.instructionsFile],
    permissions: [
      { action: "*", resource: "*", effect: "allow" },
      ...deniedTools.map((action) => ({ action, resource: "*", effect: "deny" })),
    ],
    providers: {
      [bridgeProviderId]: {
        settings: { baseURL: `${address}/v1`, headers: tokenHeader },
        models: { [model]: { limit: { output: outputLimit(task) } } },
      },
    },
    mcp: {
      [bridgeServerName]: { type: "remote", url: `${address}/mcp`, headers: tokenHeader },
    },
  };
}

/**
 * The model catalog OpenCode reads from `OPENCODE_MODELS_PATH` instead of
 * fetching models.dev: the bridge's provider with only the agent's model.
 * Its prices are 0 because the bridge, not OpenCode, counts spend. The
 * dates, modalities and `open_weights` carry no meaning here, but 2.3.0
 * finds no route to a model without them (checked by hand on HAL-18101).
 *
 * @throws Error when the task names no model
 */
export function opencodeModelCatalog(
  task: Pick<HarnessTask, "model" | "maxOutputTokens">,
): Record<string, unknown> {
  const model = requireModel(task);
  return {
    [bridgeProviderId]: {
      id: bridgeProviderId,
      name: "Halonic bridge",
      env: ["ANTHROPIC_API_KEY"],
      npm: "@ai-sdk/anthropic",
      models: {
        [model]: {
          id: model,
          name: model,
          tool_call: true,
          attachment: false,
          reasoning: false,
          temperature: true,
          release_date: "2026-01-01",
          last_updated: "2026-01-01",
          modalities: { input: ["text"], output: ["text"] },
          open_weights: true,
          cost: { input: 0, output: 0 },
          limit: { context: catalogContextTokens, output: outputLimit(task) },
        },
      },
    },
  };
}

/** The text of the session's instructions file: the fixed line, then the agent's instructions. */
export function opencodeInstructionsText(task: Pick<HarnessTask, "instructions">): string {
  const instructions = task.instructions.trim();
  return instructions === ""
    ? `${batchToolCallsLine}\n`
    : `${batchToolCallsLine}\n\n${instructions}\n`;
}

function outputLimit(task: Pick<HarnessTask, "maxOutputTokens">): number {
  return task.maxOutputTokens ?? defaultMaxOutputTokens;
}

function requireModel(task: Pick<HarnessTask, "model">): string {
  if (task.model === undefined) {
    throw new Error("OpenCode needs a model from the agent's file, and it names none.");
  }
  return task.model;
}
