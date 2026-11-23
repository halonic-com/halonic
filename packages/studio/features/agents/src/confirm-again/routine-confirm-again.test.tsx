// @vitest-environment jsdom
import {
  type RoutineRunAgentsProps,
  RoutineRunAgentsService,
} from "@halonicjs/studio-feature-routines/api";
import { loadView, type ViewRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type AgentsHost, AgentsHostService } from "../api.ts";
import { agentsFeature } from "../feature.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";

afterEach(unmount);

const writer = { hubId: "acme", id: "writer" };
const writerLine =
  "Writer runs in the sandbox until you confirm again: its file changed since you chose On this computer.";

/** The view the feature gives the Routines feature, registered on a stand-in `studio`. */
async function routineView(host: AgentsHost) {
  const provided = new Map<unknown, (services: unknown) => unknown>();
  const studio = {
    places: { add: () => undefined },
    itemKinds: { add: () => undefined },
    search: { addProvider: () => undefined },
    commands: { add: () => undefined },
    services: {
      provide: (key: unknown, make: (services: unknown) => unknown) => provided.set(key, make),
    },
  };
  agentsFeature.register(studio as never);
  const services = { get: (key: unknown) => (key === AgentsHostService ? host : undefined) };
  const view = provided.get(RoutineRunAgentsService)?.(services) as ViewRef;
  return loadView<ComponentType<RoutineRunAgentsProps>>(view);
}

async function onHoldHost() {
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [{ ...writer, name: "Writer", harness: "claude-code" }],
  });
  const shown = await host.placement(writer);
  await host.chooseThisComputer(writer, shown?.fingerprint ?? "");
  await host.update(writer, { instructions: "Reply to everyone." });
  return host;
}

verifies("agents.confirm-again.run-controls", () => {
  it("gives a routine's page the Callout, whose Review and confirm opens the agent at Where it runs", async () => {
    const RoutineConfirmAgain = await routineView(await onHoldHost());
    const openAgent = vi.fn();
    const page = await show(
      <RoutineConfirmAgain
        hubId="acme"
        agents={[{ id: "writer", name: "Writer" }]}
        openAgent={openAgent}
      />,
    );
    await act(async () => {});
    expect(page.textContent).toContain(writerLine);
    await act(async () => buttonNamed(page, "Review and confirm")?.click());
    expect(openAgent).toHaveBeenCalledWith("writer", "where-it-runs");
  });

  it("has no button where the routine's page can't open an agent", async () => {
    const RoutineConfirmAgain = await routineView(await onHoldHost());
    const page = await show(
      <RoutineConfirmAgain hubId="acme" agents={[{ id: "writer", name: "Writer" }]} />,
    );
    await act(async () => {});
    expect(page.textContent).toContain(writerLine);
    expect(page.querySelector("button")).toBeNull();
  });
});
