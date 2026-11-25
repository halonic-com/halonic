// @vitest-environment jsdom
import type { ServiceKey, WorkspaceContext } from "@halonicjs/studio-shell";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { OverviewMessagingService, OverviewService, RecapService } from "../api.ts";
import { overviewFeature } from "../feature.ts";
import { OverviewStore } from "../overview-store.ts";
import { memoryRecapMark, RecapStore } from "../recap-store.ts";
import { OverviewPlace } from "./overview-place.tsx";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A context whose services are `entries`, as the shell gives the Overview feature's views. */
function contextWith(entries: ReadonlyMap<ServiceKey<unknown>, unknown>): WorkspaceContext {
  const find = <Service,>(key: ServiceKey<Service>) => entries.get(key) as Service | undefined;
  const get = <Service,>(key: ServiceKey<Service>) => {
    const found = find(key);
    if (found === undefined) throw new Error("not provided");
    return found;
  };
  const context = { services: { get, find }, announcer: { announce: () => {} } };
  return context as unknown as WorkspaceContext;
}

/** Draws the place in `context` and gives its text. */
async function drawPlace(context: WorkspaceContext): Promise<string> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<OverviewPlace context={context} />));
  const text = container.textContent ?? "";
  act(() => root.unmount());
  container.remove();
  return text;
}

verifies("overview.place", () => {
  it("adds the Overview place", () => {
    const added: string[] = [];
    const studio = {
      services: { provide: () => {} },
      places: { add: (place: { id: string }) => added.push(place.id) },
    };

    overviewFeature.register(studio as unknown as Parameters<typeof overviewFeature.register>[0]);

    expect(added).toEqual(["overview"]);
  });

  it("shows Overview, then Recap, then the agents and that nothing is blocked", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    messaging.addAgent(acme.id, { name: "Chief" });
    const context = contextWith(
      new Map<ServiceKey<unknown>, unknown>([
        [OverviewMessagingService, messaging],
        [OverviewService, new OverviewStore(messaging)],
        [RecapService, new RecapStore(messaging, memoryRecapMark())],
      ]),
    );

    const text = await drawPlace(context);

    expect(text).toMatch(/^Overview.*Recap.*Chief.*Nothing is blocked\./su);
  });

  it("says there are no agents yet when no source is connected", async () => {
    const text = await drawPlace(contextWith(new Map()));

    expect(text).toBe("OverviewNo agents yet.");
  });
});
