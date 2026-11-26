import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-harness-model-"));
  workspace = join(folder, "acme");
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** The small workspace with agent `coder` in `harness` on alias `model`, whose provider has `type`. */
function withAgent(harness: string, model: string, type: string): void {
  writeFiles(workspace, {
    ...smallWorkspace,
    "models.yaml": `aliases:\n  ${model}:\n    provider: gateway\n    model: some-model\n`,
    "providers/gateway.yaml": `id: gateway\ntype: ${type}\nbaseUrl: https://gateway.example.com/v1\nsecret: gateway-key\n`,
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/coder.agent.yaml": `id: coder\nname: Coder\nharness: ${harness}\nmodel: ${model}\ninstructions: Fix the bugs.\n`,
  });
}

/** The `--json` problems of `validate` in the workspace. */
async function problems(): Promise<{ file: string; code: string; message: string }[]> {
  const { io } = await validateIn(workspace, "--json");
  return (JSON.parse(io.stdout.join("\n")) as { problems: [] }).problems;
}

verifies("cli.commands.validate.harness-model", () => {
  it("fails on a Claude Code agent with a model that isn't Anthropic's, naming the agent", async () => {
    withAgent("claude-code", "gpt", "openai");

    const { code, io } = await validateIn(workspace, "--dir", workspace);

    expect(code).toBe(exitCode.failed);
    const output = io.stdout.join("\n");
    expect(output).toContain(`support${sep}agents${sep}coder.agent.yaml`);
    expect(output).toContain(
      "✕ Agent coder names model gpt. Claude Code can use Anthropic models only. Choose another.  (harness-model-refused)",
    );
  });

  it("fails on a Codex agent with an Anthropic model, in --json", async () => {
    withAgent("codex", "sonnet", "anthropic");

    expect(await problems()).toContainEqual(
      expect.objectContaining({
        file: "hubs/support/agents/coder.agent.yaml",
        code: "harness-model-refused",
        message:
          "Agent coder names model sonnet. This model can't be used with Codex. Choose another.",
      }),
    );
  });

  it("warns, and passes, for a Codex agent on an OpenAI-compatible endpoint", async () => {
    withAgent("codex", "coder-model", "openai-compatible");

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).toContain(
      "Agent coder runs in Codex on provider gateway. Make sure this endpoint supports the Responses API.  (harness-endpoint-unchecked)",
    );
  });

  it("says nothing when the harness can call the provider, or the agent runs in Halonic", async () => {
    withAgent("claude-code", "sonnet", "anthropic");
    const onClaude = await problems();
    withAgent("halonic", "gpt", "openai");
    const onHalonic = await problems();

    const codes = [...onClaude, ...onHalonic].map((found) => found.code);
    expect(codes.filter((code) => code.startsWith("harness-"))).toEqual([]);
  });
});
