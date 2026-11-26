// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { WaitItem } from "../inbox-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { agentMark, itemMark } from "./row-marks.tsx";

const asked = () => new Date(2026, 10, 26, 9, 0);

/** The picture decoder and canvas jsdom lacks: every PNG decodes, and drawing it is recorded. */
const drawn: unknown[] = [];
beforeEach(() => {
  vi.stubGlobal("createImageBitmap", (blob: Blob) =>
    blob.type === "image/png"
      ? Promise.resolve({ width: 2, height: 2, close: () => {} })
      : Promise.reject(new Error("not a picture")),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (picture: unknown) => drawn.push(picture),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  drawn.length = 0;
});

const settled = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

/** Acme's Liam, with a picture, asks for an approval; Chief, without one, asks a question. */
async function acmeInbox() {
  const messaging = new FakeAgentMessaging({ now: asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const picture = { name: "liam.png", type: "image/png", bytes: new Uint8Array([137, 80]) };
  const liam = messaging.addAgent(source.id, { name: "Liam", picture });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addInboxItem(source.id, {
    question: "Merge #12?",
    kind: "approval",
    from: { kind: "agent", agent: liam.id, name: "Liam" },
  });
  messaging.addInboxItem(source.id, {
    question: "Which hostname?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs, asked)}
      now={asked}
      agentMessaging={messaging}
    />,
  );
  await settled();
  await settled();
  return root;
}

function markOf(root: HTMLElement, title: string): Element | null | undefined {
  const row = [...root.querySelectorAll('[role="grid"] tr')].find((each) =>
    each.textContent?.includes(title),
  );
  return row?.querySelector('[aria-hidden="true"]');
}

verifies("inbox.picture-badge", () => {
  it("shows who asks as the picture and the item's kind as the badge", async () => {
    const root = await acmeInbox();
    const liam = markOf(root, "Merge #12?");
    expect(liam?.querySelector("canvas")).not.toBeNull();
    expect(liam?.querySelector("[data-avatar-badge] svg rect")).not.toBeNull();
    expect(drawn).toHaveLength(1);
    const chief = markOf(root, "Which hostname?");
    expect(chief?.querySelector("canvas")).toBeNull();
    expect(chief?.textContent).toBe("C");
    // No `kind` from the source and no action: a question, so the "?" badge.
    expect(chief?.querySelector("[data-avatar-badge] svg path")).not.toBeNull();
  });

  it("gives a sender nobody named a silhouette with the badge, and the Inbox's own items none", () => {
    const fromNobody = {
      id: "item-1",
      source: "acme",
      from: { kind: "me" },
      question: "Ship it?",
      options: [],
      attachments: [],
      createdAt: "2026-11-26T09:00:00.000Z",
      state: { kind: "open" },
    } as const;
    const nobody = render(agentMark(fromNobody).avatar).firstElementChild;
    expect(nobody?.textContent).toBe("");
    expect(nobody?.querySelector("[data-avatar-badge]")).not.toBeNull();
    const wait = render(itemMark({ kind: "wait" } as WaitItem).avatar).firstElementChild;
    expect(wait?.querySelector("svg")).not.toBeNull();
    expect(wait?.querySelector("[data-avatar-badge]")).toBeNull();
  });
});
