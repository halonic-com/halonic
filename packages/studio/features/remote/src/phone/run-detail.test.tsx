// @vitest-environment jsdom

import type { GatewayEventBody } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  remoteApproval,
  remoteSession,
  remoteView,
  staleView,
} from "../test-support/fake-phone-remote.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { RemoteEvent, RemoteSession, RemoteView } from "./remote-view.ts";
import { RunDetail } from "./run-detail.tsx";
import { runHistory } from "./run-history.ts";

afterEach(unmountAll);

const now = new Date(2026, 10, 21, 14, 5);
const at = (hours: number, minutes: number) => new Date(2026, 10, 21, hours, minutes).toISOString();

const event = (seq: number, time: string, body: GatewayEventBody): RemoteEvent => ({
  seq,
  at: time,
  body,
});

const readInbox = { id: "read", summary: "read_inbox: {}", risk: "risky" } as const;
const sendReplies = { id: "send", summary: 'send_replies: {"drafts":4}', risk: "risky" } as const;

const sorter = remoteSession({
  id: "sorter",
  title: "Sorter",
  state: "waiting",
  events: [
    event(1, at(13, 50), { type: "message", role: "user", text: "Sort this mail" }),
    event(2, at(13, 52), { type: "approval-requested", approval: readInbox }),
    event(3, at(13, 53), { type: "approval-settled", approvalId: "read", decision: "approve" }),
    event(4, at(13, 58), { type: "message", role: "agent", text: "4 are about refunds." }),
    event(5, at(14, 2), { type: "approval-requested", approval: sendReplies }),
  ],
});
const sorterAsks = remoteApproval({
  sessionId: "sorter",
  approval: sendReplies,
  requestedAt: at(14, 2),
  canAnswer: false,
  offReason: "Answer this on your computer.",
  answerOnComputer: true,
});
const live = remoteView({ sessions: [sorter], openApprovals: [sorterAsks] });

function show(view: RemoteView, sessionId = "sorter") {
  const onBack = vi.fn();
  const onSend = vi.fn(async () => ({ kind: "done" }) as const);
  const screen = render(
    <RunDetail
      view={view}
      sessionId={sessionId}
      label={<span>Connected</span>}
      banner={<section aria-label="banner">Can't reach Work laptop</section>}
      onBack={onBack}
      onSend={onSend}
      now={() => now}
    />,
  );
  const history = () => screen.querySelector('section[aria-label$="messages and approvals"]');
  return { screen, history, onBack, onSend };
}

const ending = (view: RemoteView, session: RemoteSession) => runHistory(view, session, now).at(-1);

verifies("remote.phone-run-detail", () => {
  it("shows Back, the agent's name as the focused heading, and the connection label", () => {
    const { screen, onBack } = show(live);
    const heading = screen.querySelector("h1");
    expect(heading?.textContent).toBe("Sorter");
    expect(document.activeElement).toBe(heading);
    expect(screen.querySelector("header")?.textContent).toContain("Connected");
    const back = screen.querySelector<HTMLButtonElement>('button[aria-label="Back to Agents"]');
    act(() => back?.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows the messages and approvals oldest first, with the computer's times", () => {
    const { history } = show(live);
    expect(history()?.getAttribute("aria-label")).toBe("Sorter's messages and approvals");
    const text = history()?.textContent ?? "";
    const order = ["Sort this mail", "13:50", "Approved 13:53 · read_inbox: {}", "4 are about"];
    const places = order.map((each) => text.indexOf(each));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(history()?.querySelector("h2")?.textContent).toBe("Sorter said");
  });

  it("shows a waiting approval with what it asks and its time, to answer on the computer", () => {
    const { history } = show(live);
    const waiting = history()?.lastElementChild?.lastElementChild;
    expect(waiting?.textContent).toContain("Sorter is waiting for your OK");
    expect(waiting?.textContent).toContain('send_replies: {"drafts":4}');
    expect(waiting?.textContent).toContain("14:02");
    expect(waiting?.textContent).toContain("Answer this on your computer.");
    expect(history()?.querySelector("button")).toBeNull();
  });

  it("says when the phone dropped older events, and a denial or a lone answer in one line", () => {
    const writer = remoteSession({
      id: "writer",
      title: "Writer",
      droppedOlder: true,
      events: [
        event(7, at(13, 30), { type: "approval-settled", approvalId: "old", decision: "approve" }),
        event(8, at(13, 39), { type: "approval-requested", approval: readInbox }),
        event(9, at(13, 40), { type: "approval-settled", approvalId: "read", decision: "deny" }),
      ],
    });
    const items = runHistory(remoteView({ sessions: [writer] }), writer, now);
    expect(items.map((item) => ("text" in item ? item.text : item.kind))).toEqual([
      "dropped",
      "Approved 13:30",
      "Denied 13:40 · read_inbox: {}",
      "Writer is working…",
    ]);
    const { history } = show(remoteView({ sessions: [writer] }), "writer");
    expect(history()?.textContent).toMatch(/^Older activity isn't kept on this phone\./);
  });

  it("ends with how the agent stands: working, finished or failed", () => {
    const reporter = remoteSession({ id: "reporter", title: "Reporter" });
    const view = remoteView({ sessions: [reporter] });
    expect(runHistory(view, reporter, now).map((item) => item.kind)).toEqual([
      "nothing",
      "working",
    ]);
    const done = { ...reporter, state: "done", updatedAt: at(13, 40) } as const;
    expect(ending(view, done)).toMatchObject({ tone: "plain", text: "Finished 13:40" });
    const failed = { ...reporter, state: "failed", updatedAt: at(14, 10) } as const;
    expect(ending(view, failed)).toMatchObject({
      tone: "danger",
      text: "Failed 14:10. See what happened on your computer.",
    });
  });

  it("while stale, puts the banner above the history, says working as of, and turns the prompt box off", () => {
    const reporter = remoteSession({ id: "reporter", title: "Reporter" });
    const stale = staleView(remoteView({ sessions: [reporter] }), "unreachable");
    expect(ending(stale, reporter)).toMatchObject({ text: "Working as of 14:02." });
    const { screen, history } = show(stale, "reporter");
    const banner = screen.querySelector('section[aria-label="banner"]');
    const transcript = history();
    expect(banner).not.toBeNull();
    expect(transcript?.contains(banner)).toBe(false);
    expect(banner && transcript ? banner.compareDocumentPosition(transcript) : 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.querySelector("textarea")?.getAttribute("aria-disabled")).toBe("true");

    unmountAll();
    expect(show(live).screen.querySelector('section[aria-label="banner"]')).toBeNull();
  });

  it("sends a prompt to this agent", async () => {
    const { screen, onSend } = show(live);
    const box = screen.querySelector("textarea");
    expect(box?.placeholder).toBe("Message Sorter…");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        box,
        "Only the urgent ones",
      );
      box?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...screen.querySelectorAll("button")].find((b) => b.textContent === "Send");
    await act(async () => send?.click());
    expect(onSend).toHaveBeenCalledExactlyOnceWith("sorter", "Only the urgent ones");
  });

  it("goes back to Agents when the agent leaves the computer's list", () => {
    const { screen, onBack } = show(remoteView({ sessions: [] }));
    expect(screen.innerHTML).toBe("");
    expect(onBack).toHaveBeenCalledOnce();
  });
});
