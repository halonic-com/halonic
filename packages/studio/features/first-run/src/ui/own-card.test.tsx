// @vitest-environment jsdom
import { AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { ModelsFilesService, ProviderCheckService } from "@halonicjs/studio-feature-models/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import type { ServiceKey, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstRunService, SampleWorkspaceService } from "../api.ts";
import { OwnCard, ownStepOpeners } from "./own-card.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

const nothing = () => () => {};

const TEST_MODEL = { id: "mock", text: "id: mock\nname: Test model\ntype: mock\n" };
const OLLAMA = { id: "ollama", text: "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n" };

/**
 * Home's context in Acme: by default a new workspace on the test model with no agent and no runs;
 * `allDone` puts `default` on an Ollama that answers, with an agent and a finished run, on a visit
 * after the card first showed.
 */
function acmeContext({ sample = false, allDone = false } = {}) {
  const provider = allDone ? OLLAMA : TEST_MODEL;
  const agents = allDone ? [{ hubId: "default", id: "writer", name: "Writer" }] : [];
  const runs = allDone ? [{ summary: { kind: "run", status: "completed" } }] : [];
  const services = new Map<ServiceKey<unknown>, unknown>([
    [FirstRunService, { isDemo: sample, isOnHere: false }],
    [
      SampleWorkspaceService,
      { ownCardMemory: () => (allDone ? "showing" : "unseen"), recordOwnCard: () => {} },
    ],
    [RunsListService, { state: { runs, loaded: true }, subscribe: nothing }],
    [AgentsHostService, { list: async () => agents, subscribe: nothing }],
    [ProviderCheckService, { addressOf: () => "localhost:11434", isAnswering: async () => true }],
    [
      ModelsFilesService,
      {
        readModels: async () =>
          `aliases:\n  default:\n    provider: ${provider.id}\n    model: m1\n`,
        readProviders: async () => [{ path: `providers/${provider.id}.yaml`, text: provider.text }],
        readWorkspace: async () => null,
        subscribe: nothing,
      },
    ],
  ]);
  const lookup = {
    get: (key: ServiceKey<unknown>) => services.get(key),
    find: (key: ServiceKey<unknown>) => services.get(key),
  };
  return {
    services: lookup,
    openItem: vi.fn(),
    runCommand: vi.fn(),
  } as unknown as WorkspaceContext;
}

async function renderCard(context: WorkspaceContext): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<OwnCard context={context} attempt={0} />));
  return container;
}

verifies("first-run.own-card", () => {
  describe("OwnCard", () => {
    it("suggests the three steps on a new workspace's Home, none done", async () => {
      const card = await renderCard(acmeContext());
      expect(card.textContent).toContain("0 of 3 done");
      expect(
        [...card.querySelectorAll("[aria-label^='Step']")].map((row) =>
          row.getAttribute("aria-label"),
        ),
      ).toEqual([
        "Step 1 of 3: Connect your own model, not done",
        "Step 2 of 3: Make your first agent, not done",
        "Step 3 of 3: Run it once, not done",
      ]);
      expect(card.textContent).toContain(
        "Until then, agents use the test model, which repeats your message back.",
      );
      expect(card.textContent).not.toContain("won't show here again");
    });

    it("says it won't show again once all three are done", async () => {
      const card = await renderCard(acmeContext({ allDone: true }));
      await vi.waitFor(() => expect(card.textContent).toContain("3 of 3 done"));
      expect(card.textContent).toContain("You're set up. Get set up won't show here again.");
    });

    it("shows nothing in the sample", async () => {
      const card = await renderCard(acmeContext({ sample: true }));
      expect(card.textContent).toBe("");
    });
  });

  describe("ownStepOpeners", () => {
    it("opens the default alias, New agent, and the last agent or else New agent", () => {
      const context = { openItem: vi.fn(), runCommand: vi.fn() };
      const before = ownStepOpeners(context, undefined);
      before.model();
      before.run();
      expect(context.openItem).toHaveBeenCalledWith({
        kind: "model-alias",
        hub: "local",
        id: "default",
      });
      expect(context.runCommand).toHaveBeenCalledWith("agents.new");

      ownStepOpeners(context, { hubId: "default", id: "writer" }).run();
      expect(context.openItem).toHaveBeenLastCalledWith({
        kind: "agent",
        hub: "default",
        id: "writer",
      });
    });
  });
});
