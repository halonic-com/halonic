// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { PresentationProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  type ConnectorStatus,
  type ConnectorStatusHost,
  ConnectorStatusHostService,
} from "../connector-status-host.ts";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPlace } from "./library-place.tsx";

vi.mock("@halonicjs/studio-feature-files/api", () => ({ requestFilesReveal: vi.fn() }));

afterEach(unmountAll);

const noUsage = { agents: [], hubs: [], routines: [], collections: [] };

/** Acme's two connectors: a web search and Sam's mail. */
const items: LibraryItemsHost = {
  list: async (kind: LibraryItemKind) => ({
    hubs:
      kind === "connector"
        ? [
            {
              id: "acme",
              name: "acme",
              entries: [
                { id: "search", name: "Web search", usage: noUsage },
                { id: "mail", name: "mail", usage: noUsage },
              ],
            },
          ]
        : [],
  }),
  remove: async () => ({ undo: async () => {} }),
  readFile: async () => "",
  subscribe: () => () => {},
};

/** A status host whose list is `connectors`, and that tells its listeners when `set` changes it. */
function statusOf(connectors: readonly ConnectorStatus[]): {
  host: ConnectorStatusHost;
  set: (next: readonly ConnectorStatus[]) => void;
} {
  let listed = connectors;
  const listeners = new Set<() => void>();
  return {
    host: {
      list: async () => listed,
      refusals: async () => [],
      waiting: async () => [],
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    set: (next) => {
      listed = next;
      for (const listener of listeners) listener();
    },
  };
}

const search: ConnectorStatus = { id: "search", name: "Web search", state: "not-checked" };
const mail: ConnectorStatus = { id: "mail", name: "mail", state: "not-connected" };

async function connectorsRow(status: ConnectorStatusHost | undefined): Promise<string | null> {
  const provided = new Map<unknown, unknown>([[LibraryItemsHostService, items]]);
  if (status !== undefined) provided.set(ConnectorStatusHostService, status);
  const services = {
    get: (key: unknown) => provided.get(key),
    find: (key: unknown) => provided.get(key),
  };
  const context = { services, openPlaceList: vi.fn() } as unknown as WorkspaceContext;
  const page = render(
    <PresentationProvider presentation="phone">
      <LibraryPlace context={context} />
    </PresentationProvider>,
  );
  await settled();
  return page.querySelectorAll("li button")[3]?.textContent ?? null;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("library.connector-blocked-count", () => {
  it("adds how many connectors are blocked to the Connectors row", async () => {
    const { host } = statusOf([{ ...search, blocked: true }, mail]);

    expect(await connectorsRow(host)).toBe("Connectors2 connectors · 1 blocked›");
  });

  it("shows only the count when no connector is blocked", async () => {
    const { host } = statusOf([search, mail]);

    expect(await connectorsRow(host)).toBe("Connectors2 connectors›");
  });

  it("shows only the count when there is no connector status", async () => {
    expect(await connectorsRow(undefined)).toBe("Connectors2 connectors›");
  });

  it("shows only the count when the status can't be read", async () => {
    const host: ConnectorStatusHost = {
      ...statusOf([]).host,
      list: async () => Promise.reject(new Error("unreadable")),
    };

    expect(await connectorsRow(host)).toBe("Connectors2 connectors›");
  });

  it("follows the status when a connector becomes blocked", async () => {
    const status = statusOf([search, mail]);
    expect(await connectorsRow(status.host)).toBe("Connectors2 connectors›");

    act(() =>
      status.set([
        { ...search, blocked: true },
        { ...mail, blocked: true },
      ]),
    );
    await settled();

    const rows = [...document.querySelectorAll("li button")].map((each) => each.textContent);
    expect(rows).toContain("Connectors2 connectors · 2 blocked›");
  });
});
