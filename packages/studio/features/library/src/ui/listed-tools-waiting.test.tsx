// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import {
  type ListedToolRow,
  type ListedToolsHost,
  ListedToolsHostService,
  type ListedToolsSnapshot,
} from "../listed-tools-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const statusHost: ConnectorStatusHost = {
  list: async () => [{ id: "notes", name: "Notes", state: "connected" }],
  refusals: async () => [],
  subscribe: () => () => {},
};

function tool(name: string): ListedToolRow {
  return {
    name,
    fingerprint: `htl1:${name}-1`,
    description: `Does ${name}.`,
    arguments: [],
    state: "not_approved",
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
  };
}

function snapshot(waiting: readonly string[]): ListedToolsSnapshot {
  return {
    sourceName: "Notes",
    toReview: waiting.map(tool),
    keepsChanging: [],
    refused: [],
    approved: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
  };
}

function toolsHost(read: ListedToolsHost["review"]): ListedToolsHost {
  return {
    review: read,
    approve: async () => ({ approved: [], changed: [] }),
    removeApproval: async () => {},
    subscribe: () => () => {},
  };
}

function page(tools: ListedToolsHost | undefined): ItemViewProps {
  const provided = new Map<unknown, unknown>([[ConnectorStatusHostService, statusHost]]);
  if (tools !== undefined) provided.set(ListedToolsHostService, tools);
  return {
    item: { kind: "connector", hub: "local", id: "notes" },
    context: {
      services: {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      },
      announcer: { announceState: vi.fn() },
    },
  } as unknown as ItemViewProps;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function reviewButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Review tools",
  );
}

describe("the connector page's listed tools", () => {
  verifies("library.listed-tools-waiting", () => {
    it("says how many tools wait and opens the review from Review tools", async () => {
      const root = render(
        <ConnectorPage {...page(toolsHost(async () => snapshot(["read_note", "write_note"])))} />,
      );
      await settled();
      expect(root.textContent).toContain("2 tools are waiting for your approval");
      expect(root.querySelector("dialog[open]")).toBeNull();

      act(() => reviewButton(root)?.click());
      await settled();
      expect(root.querySelector("dialog[open]")?.textContent).toContain(
        "Review the tools from Notes",
      );
    });

    it("shows no line and no button when no tool waits", async () => {
      const root = render(<ConnectorPage {...page(toolsHost(async () => snapshot([])))} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });

    it("shows no line and no button when the tools can't be read", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              throw new Error("server down");
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });

    it("shows neither without a listed-tools service", async () => {
      const root = render(<ConnectorPage {...page(undefined)} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });
  });
});
