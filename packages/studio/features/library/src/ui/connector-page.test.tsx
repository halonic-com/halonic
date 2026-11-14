// @vitest-environment jsdom
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

afterEach(unmountAll);

const host: ConnectorStatusHost = {
  list: async () => [{ id: "notes", name: "Notes", state: "connected" }],
  refusals: async () => [],
  subscribe: () => () => {},
};

function props(id: string, openPlace = vi.fn()): ItemViewProps {
  return {
    item: { kind: "connector", hub: "local", id },
    context: {
      services: {
        get: (key: unknown) => (key === ConnectorStatusHostService ? host : undefined),
        find: () => undefined,
      },
      announcer: { announceState: vi.fn() },
      openPlace,
    },
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ConnectorPage", () => {
  it("shows the connector's name as the h1, then its status section", async () => {
    const root = render(<ConnectorPage {...props("notes")} />);
    await settled();
    expect(root.querySelector("h1")?.textContent).toBe("Notes");
    expect(root.querySelector("h2")?.textContent).toBe("Recent refusals");
  });

  it("says the connector isn't in the workspace when the host doesn't list it", async () => {
    const openPlace = vi.fn();
    const root = render(<ConnectorPage {...props("gone", openPlace)} />);
    await settled();
    expect(root.textContent).toContain("connector");
    expect(root.textContent).not.toContain("Recent refusals");
  });
});
