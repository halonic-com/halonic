// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentHarnessId, AliasSummary } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";

afterEach(unmount);

// Invented aliases, each with how the harnesses get on with its provider, as the app's host tells it.
const summaries: Readonly<Record<string, AliasSummary>> = {
  sonnet: {
    provider: "Anthropic",
    model: "claude-sonnet-5-5",
    cost: { kind: "no-price" },
    harnessFit: { codex: "refused" },
  },
  gpt: {
    provider: "OpenAI",
    model: "gpt-5.5",
    cost: { kind: "no-price" },
    harnessFit: { "claude-code": "refused", opencode: "refused" },
  },
  gateway: {
    provider: "Acme gateway",
    model: "coder-large",
    cost: { kind: "no-price" },
    harnessFit: { "claude-code": "refused", codex: "check-endpoint", opencode: "refused" },
  },
};

const codexRefused = "This model can't be used with Codex. Choose another.";
const claudeRefused = "Claude Code can use Anthropic models only.";
const endpoint = "Make sure this endpoint supports the Responses API.";

/** Coder's Model page, on `model` in `harness`. */
async function modelPage(model: string, harness: AgentHarnessId): Promise<HTMLElement> {
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "coder", name: "Coder", model, harness }],
    modelAliases: Object.keys(summaries),
    aliasSummaries: summaries,
  });
  const page = await show(<AgentScreen host={host} hubId="acme" id="coder" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent?.startsWith("Model"))
      ?.click(),
  );
  return page;
}

verifies("agents.configuration.harness-model", () => {
  it("says a Codex agent can't use a model that isn't OpenAI's", async () => {
    const page = await modelPage("sonnet", "codex");

    expect(page.textContent).toContain(codexRefused);
    expect(page.querySelector("select")?.getAttribute("aria-invalid")).toBe("true");
  });

  it("says a Claude Code agent can use Anthropic models only", async () => {
    const page = await modelPage("gpt", "claude-code");

    expect(page.textContent).toContain(claudeRefused);
  });

  it("says OpenCode can use Anthropic models only", async () => {
    const page = await modelPage("gpt", "opencode");

    expect(page.textContent).toContain("OpenCode can use Anthropic models only.");
  });

  it("asks a Codex agent on an OpenAI-compatible provider to check the endpoint", async () => {
    const page = await modelPage("gateway", "codex");

    expect(page.textContent).toContain(endpoint);
    expect(page.textContent).not.toContain(codexRefused);
  });

  it("says nothing when the harness can call the provider, or the agent runs in Halonic", async () => {
    for (const [model, harness] of [
      ["sonnet", "claude-code"],
      ["gpt", "codex"],
      ["gateway", "halonic"],
    ] as const) {
      const page = await modelPage(model, harness);
      expect(page.textContent).not.toContain(codexRefused);
      expect(page.textContent).not.toContain(claudeRefused);
      expect(page.textContent).not.toContain(endpoint);
      unmount();
    }
  });
});
