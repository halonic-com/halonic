// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import {
  type ActiveAccount,
  ActiveAccountService,
  type AgentConnection,
  AgentConnectionsService,
  FakeAgentConnections,
} from "@halonicjs/studio-services";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillDialog, settle } from "../test-support/dom.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AccountSwitcherItem } from "./account-switcher-item.tsx";

const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;

beforeEach(() => {
  polyfillDialog();
  // jsdom has no popovers; these stand in for the browser's.
  for (const name of ["showPopover", "hidePopover", "togglePopover"]) prototype[name] = () => {};
});

afterEach(() => {
  unmountAll();
  for (const name of ["showPopover", "hidePopover", "togglePopover"]) delete prototype[name];
});

const base: AgentConnection = {
  id: "paperclip:ada",
  provider: "paperclip",
  label: "Paperclip · Acme · Ada",
  userName: "Ada",
  address: "https://paperclip.acme.test",
  state: { kind: "online", asOf: "2026-11-24T14:00:00.000Z" },
};
const ada = base;
const { userName: _name, ...withoutUserName } = ada;
const bo: AgentConnection = {
  ...base,
  id: "paperclip:bo",
  label: "Paperclip · Acme · Bo",
  userName: "Bo",
};

/** The pick as the host settings keep it, without the store. */
class Pick implements ActiveAccount {
  picked: string | undefined;
  readonly listeners = new Set<() => void>();
  preferred = () => this.picked;
  async select(connection: string): Promise<void> {
    this.picked = connection;
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function renderSwitcher(
  connections: readonly AgentConnection[],
  pick: Pick,
  openSettings?: (section?: string) => void,
): Promise<HTMLElement> {
  const fake = new FakeAgentConnections({ connections });
  const provided = new Map<unknown, unknown>([
    [AgentConnectionsService, fake],
    [ActiveAccountService, pick],
  ]);
  const find = (key: unknown) => provided.get(key);
  const context = { services: { find }, openSettings } as unknown as WorkspaceContext;
  const container = render(
    <PresentationProvider presentation="desktop">
      <AccountSwitcherItem context={context} />
    </PresentationProvider>,
  );
  await settle();
  return container;
}

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll("[role=menuitem]")].map((row) => row.textContent);

verifies("connections.account-switcher", () => {
  describe("the account switcher", () => {
    it("lists the accounts by user, marking the first while none is picked", async () => {
      const container = await renderSwitcher([ada, bo], new Pick());
      const trigger = container.querySelector("button[aria-haspopup=menu]");
      expect(trigger?.getAttribute("aria-label")).toBe("Account: Ada");
      expect(rows(container)).toEqual(["AdaShowing now", "Bo"]);
    });

    it("switches the active account when another is picked", async () => {
      const pick = new Pick();
      const container = await renderSwitcher([ada, bo], pick);
      const bos = [...container.querySelectorAll<HTMLElement>("[role=menuitem]")][1];
      await act(async () => bos?.click());
      expect(pick.picked).toBe(bo.id);
      expect(rows(container)).toEqual(["Ada", "BoShowing now"]);
    });

    it("opens Settings › Connections", async () => {
      const openSettings = vi.fn();
      const container = await renderSwitcher([ada], new Pick(), openSettings);
      const last = [...container.querySelectorAll<HTMLElement>("[role=menuitem]")].at(-1);
      await act(async () => last?.click());
      expect(openSettings).toHaveBeenCalledWith("connections");
    });

    it("draws nothing while no account is linked", async () => {
      expect((await renderSwitcher([], new Pick())).innerHTML).toBe("");
    });

    it("names a connection by its label while it has no user name yet", async () => {
      const container = await renderSwitcher([withoutUserName], new Pick());
      expect(rows(container)).toEqual(["Paperclip · Acme · AdaShowing now"]);
    });
  });
});
