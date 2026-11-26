// @vitest-environment jsdom

import { type Models, ModelsService } from "@halonicjs/studio-feature-models/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AliasSummary } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { aliasOpener } from "./alias-opener.ts";

afterEach(unmount);

// Invented aliases, as a workspace's Models pages would list them.
const summaries: Readonly<Record<string, AliasSummary>> = {
  smart: {
    provider: "Anthropic",
    model: "claude-sonnet-5-5",
    cost: { kind: "price", input: "€3.00", output: "€15.00" },
  },
  fast: { provider: "Anthropic", model: "claude-haiku-4-5", cost: { kind: "no-price" } },
  local: { provider: "Ollama", model: "llama3.2", cost: { kind: "on-this-computer" } },
  test: { provider: "Test model", model: "echo", cost: { kind: "test-model" } },
};

/** The Models feature as `ModelsService` gives it, keeping each alias it was asked to open. */
function fakeModels(): Models & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    keyStored: async () => false,
    openProviderPage: () => {},
    openAlias: (name, options) =>
      opened.push(options?.focusPrice === true ? `${name} at its price` : name),
  };
}

/** Sorter's Model page, on `model`, in a window whose services hold `models`. */
async function openModel(model: string, models?: Models) {
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter", model }],
    modelAliases: Object.keys(summaries),
    aliasSummaries: summaries,
  });
  const services = {
    find: (key: unknown) => (key === ModelsService ? models : undefined),
  } as unknown as WorkspaceContext["services"];
  const page = await show(
    <AgentScreen host={host} hubId="acme" id="sorter" openAlias={aliasOpener({ services })} />,
  );
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent?.startsWith("Model"))
      ?.click(),
  );
  const select = page.querySelector("select") as HTMLSelectElement;
  return { page, select };
}

verifies("agents.configuration.alias-line", () => {
  it("shows the alias's provider, model and price under the picker, and the name opens it on Models", async () => {
    const models = fakeModels();
    const { page } = await openModel("smart", models);
    expect(page.textContent).toContain(
      "smart · Anthropic / claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens",
    );

    await act(async () => buttonNamed(page, "smart")?.click());
    expect(models.opened).toEqual(["smart"]);
  });

  it("ends with No price and Add a price, which opens the alias at its price", async () => {
    const models = fakeModels();
    const { page } = await openModel("fast", models);
    expect(page.textContent).toContain(
      "fast · Anthropic / claude-haiku-4-5 · No price · Add a price",
    );

    await act(async () => buttonNamed(page, "Add a price")?.click());
    expect(models.opened).toEqual(["fast at its price"]);
  });

  it("says a model on this computer and the test model cost nothing", async () => {
    const { page: local } = await openModel("local");
    expect(local.textContent).toContain("local · Ollama / llama3.2 · On this computer, no cost");
    unmount();
    const { page: test } = await openModel("test");
    expect(test.textContent).toContain("test · Test model / echo · Built-in test model, no cost");
  });

  it("follows the pick", async () => {
    const { page, select } = await openModel("smart");
    await act(async () => {
      select.value = "local";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(page.textContent).toContain("local · Ollama / llama3.2");
    expect(page.textContent).not.toContain("claude-sonnet-5-5");
  });

  it("leaves the name as text where the Models feature isn't there", async () => {
    const { page } = await openModel("smart");
    expect(page.textContent).toContain("smart · Anthropic / claude-sonnet-5-5");
    expect(buttonNamed(page, "smart")).toBeUndefined();
    expect(buttonNamed(page, "Add a price")).toBeUndefined();
  });

  it("shows no line for a provider/model name or an alias the hub doesn't have", async () => {
    const { page } = await openModel("ollama/llama3.2", fakeModels());
    expect(page.textContent).not.toContain("per million tokens");
    expect(page.textContent).not.toContain(" · ");
    unmount();
    const { page: unknown } = await openModel("smrt", fakeModels());
    expect(unknown.textContent).not.toContain(" · ");
  });
});
