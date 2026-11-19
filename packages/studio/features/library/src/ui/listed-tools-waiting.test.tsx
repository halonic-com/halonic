// @vitest-environment jsdom
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
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
  waiting: async () => [],
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
    asksBeforeUse: true,
  };
}

function snapshot(waiting: readonly string[]): ListedToolsSnapshot {
  return {
    sourceName: "Notes",
    workspaceName: "Acme",
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

function page(tools: ListedToolsHost | undefined, host?: "phone"): ItemViewProps {
  const provided = new Map<unknown, unknown>([[ConnectorStatusHostService, statusHost]]);
  if (tools !== undefined) provided.set(ListedToolsHostService, tools);
  return {
    item: { kind: "connector", hub: "local", id: "notes" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => provided.get(key),
        find: (key: unknown) => provided.get(key),
      }),
      announcer: { announceState: vi.fn() },
      host,
    },
    Sections: () => null,
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

    it("says approving is for the computer, with no button, on a phone", async () => {
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => snapshot(["read_note"])),
            "phone",
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain("1 tool is waiting for your approval");
      expect(root.textContent).toContain(
        "View only here. Review the tools on the computer running Halonic.",
      );
      expect(reviewButton(root)).toBeUndefined();
    });

    it("shows no line and no button when no tool waits", async () => {
      const root = render(<ConnectorPage {...page(toolsHost(async () => snapshot([])))} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });

    it("says the tools couldn't be read and offers Try again", async () => {
      let fail = true;
      const root = render(
        <ConnectorPage
          {...page(
            toolsHost(async () => {
              if (fail) throw new Error("server down");
              return snapshot(["read_note"]);
            }),
          )}
        />,
      );
      await settled();
      expect(root.textContent).toContain("Couldn't list the tools");
      expect(reviewButton(root)).toBeUndefined();

      fail = false;
      const retry = [...root.querySelectorAll("button")].find((b) => b.textContent === "Try again");
      act(() => retry?.click());
      await settled();
      expect(root.textContent).toContain("1 tool is waiting for your approval");
    });

    it("says a refused list or an unreadable approval has no rows, with Review tools", async () => {
      const refused: ListedToolsSnapshot = { ...snapshot([]), listingRefused: "too many tools" };
      const unreadable: ListedToolsSnapshot = { ...snapshot([]), unreadable: {} };
      for (const [read, text] of [
        [refused, "Couldn't use this server's tool list"],
        [unreadable, "Couldn't read an approval"],
      ] as const) {
        const root = render(<ConnectorPage {...page(toolsHost(async () => read))} />);
        await settled();
        expect(root.textContent).toContain(text);
        act(() => reviewButton(root)?.click());
        await settled();
        expect(root.querySelector("dialog[open]")).not.toBeNull();
        unmountAll();
      }
    });

    it("shows neither without a listed-tools service", async () => {
      const root = render(<ConnectorPage {...page(undefined)} />);
      await settled();
      expect(root.textContent).not.toContain("waiting for your approval");
      expect(reviewButton(root)).toBeUndefined();
    });
  });
});
