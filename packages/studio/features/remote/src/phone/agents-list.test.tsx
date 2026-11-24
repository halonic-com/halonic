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
import { agentLine, agentRowLine } from "./agent-line.ts";
import { AgentsList } from "./agents-list.tsx";
import { type HostText, hostShown } from "./host-text.ts";
import type { RemoteEvent, RemoteSendOutcome, RemoteView } from "./remote-view.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

afterEach(unmountAll);

/** The state chip's classes, which carry its tone. */
const chipOf = (row: Element | undefined) =>
  row?.querySelector('span[aria-hidden="true"].shrink-0 > span')?.className;

const shown = (line: HostText | undefined) => (line === undefined ? undefined : hostShown(line));

const now = new Date(2026, 10, 21, 14, 5);

const said = (seq: number, text: string, role: "agent" | "user" = "agent"): RemoteEvent => ({
  seq,
  at: "2026-11-21T14:00:00.000Z",
  body: { type: "message", role, text } satisfies GatewayEventBody,
});

const reporter = remoteSession({
  id: "reporter",
  title: "Reporter",
  events: [said(1, "Writing the weekly report\nSection 1 of 3"), said(2, "Thanks", "user")],
});
const sorter = remoteSession({ id: "sorter", title: "Sorter", state: "waiting" });
const writer = remoteSession({
  id: "writer",
  title: "Writer",
  state: "done",
  updatedAt: new Date(2026, 10, 21, 13, 40).toISOString(),
});
const sorterAsks = remoteApproval({
  sessionId: "sorter",
  approval: { id: "send-replies", summary: "Send 4 replies", risk: "normal" },
});

const live = remoteView({ sessions: [reporter, sorter, writer], openApprovals: [sorterAsks] });

function show(view: RemoteView) {
  const onAnswer = vi.fn();
  const onOpen = vi.fn();
  const screen = render(
    <AgentsList view={view} onOpen={onOpen} onAnswer={onAnswer} now={() => now} />,
  );
  const rows = [...screen.querySelectorAll("li")];
  const button = (label: string) =>
    [...screen.querySelectorAll("button")].find((each) => each.textContent === label);
  return { screen, rows, button, onAnswer, onOpen };
}

verifies("remote.phone-agents", () => {
  it("gives each agent its name, a line and its state, in the host's order", () => {
    const { rows } = show(live);
    expect(rows.map((row) => row.querySelector(".sr-only")?.textContent)).toEqual([
      "Reporter, Writing the weekly report, Running",
      "Sorter, Send 4 replies, Needs you",
      "Writer, Finished 13:40, Done",
    ]);
    expect(rows[0]?.textContent).toContain("Running");
    // The 40px tile with the 12px radius, as drawn and as Paired computers has.
    const tile = rows[0]?.querySelector('[aria-hidden="true"]');
    expect(tile?.textContent).toBe("R");
    expect(tile?.className.split(" ")).toEqual(expect.arrayContaining(["size-10", "rounded-md"]));
  });

  it("reads the line from the end, the oldest open approval, then the agent's newest message", () => {
    expect(
      shown(agentLine(remoteSession({ state: "failed", updatedAt: "not a date" }), undefined, now)),
    ).toBe("Failed");
    expect(shown(agentLine(sorter, sorterAsks, now))).toBe("Send 4 replies");
    expect(
      agentLine(remoteSession({ events: [said(1, "  \n  ")] }), undefined, now),
    ).toBeUndefined();
    expect(agentLine(remoteSession(), undefined, now)).toBeUndefined();
  });

  it("ends each line with the time of the last update while it can't answer", () => {
    const stale = staleView(live, "unreachable");
    const { rows, screen } = show(stale);
    expect(rows[0]?.textContent).toContain("Writing the weekly report · as of 14:02");
    expect(rows[1]?.querySelector(".sr-only")?.textContent).toBe(
      "Sorter, Send 4 replies, as of 14:02, Needs you",
    );
    expect(screen.textContent).toContain("You can answer once your phone reconnects.");
    // The chips go grey, with their words and dot, so the phone doesn't claim the state now (C49 G6).
    const liveRows = show(live).rows;
    expect(chipOf(liveRows[0])).not.toBe(chipOf(liveRows[1]));
    expect(chipOf(rows[0])).toBe(chipOf(rows[1]));
    expect(chipOf(rows[0])).not.toBe(chipOf(liveRows[0]));
    expect(rows[1]?.textContent).toContain("Needs you");
    // An agent that ended keeps its end time alone: no second time beside it (C672).
    expect(rows[2]?.querySelector(".sr-only")?.textContent).toBe("Writer, Finished 13:40, Done");
    expect(shown(agentRowLine(stale, remoteSession(), undefined, now))).toBe("as of 14:02");
    expect(shown(agentRowLine({ ...stale, asOf: undefined }, reporter, undefined, now))).toBe(
      "Writing the weekly report",
    );
  });

  it("keeps Approve and Reject off with the reason under them, and sends nothing", () => {
    const { button, onAnswer } = show(staleView(live, "reconnecting"));
    const approve = button("Approve Sorter");
    expect(approve?.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(approve?.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("You can answer once your phone reconnects.");
    act(() => approve?.click());
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("says to answer a risky approval on the computer, with no Approve or Reject", () => {
    const risky = remoteApproval({
      ...sorterAsks,
      canAnswer: false,
      offReason: ANSWER_RISKY_ON_COMPUTER,
      answerOnComputer: true,
    });
    for (const view of [
      { ...live, openApprovals: [risky] },
      staleView({ ...live, openApprovals: [risky] }, "unreachable"),
    ]) {
      const { rows, button } = show(view);
      expect(button("Approve Sorter")).toBeUndefined();
      expect(button("Reject Sorter")).toBeUndefined();
      expect(rows[1]?.textContent).toContain("Answer this on your computer.");
      expect(rows[1]?.textContent).not.toContain("once your phone reconnects");
      unmountAll();
    }
  });

  it("opens an agent's run detail when its row is tapped", () => {
    const { rows, onOpen } = show(live);
    const row = rows[0]?.querySelector("button");
    expect(row?.textContent).toContain("Reporter");
    act(() => row?.click());
    expect(onOpen).toHaveBeenCalledWith("reporter");
  });

  it("sends an answer while it can, and not again while it is on its way", () => {
    const { button, onAnswer } = show(live);
    act(() => button("Reject Sorter")?.click());
    expect(onAnswer).toHaveBeenCalledWith("sorter", "send-replies", "deny");

    unmountAll();
    const sent = remoteApproval({ ...sorterAsks, canAnswer: false, sent: "deny" });
    const again = show({ ...live, openApprovals: [sent] });
    expect(again.button("Approve Sorter")).toBeUndefined();
    // The one answer button left, under Sorter's row: busy, and sends nothing.
    const busy = again.rows[1]?.querySelector<HTMLButtonElement>(":scope > div button");
    expect(busy?.textContent).toContain("Reject");
    act(() => busy?.click());
    expect(again.onAnswer).not.toHaveBeenCalled();
  });

  it("names Approve and Reject after the agent they answer", () => {
    const { rows } = show(live);
    const names = [...(rows[1]?.querySelectorAll(":scope > div button") ?? [])].map(
      (each) => each.textContent,
    );
    expect(names).toEqual(["Approve Sorter", "Reject Sorter"]);
  });

  it("says what was answered and keeps focus on the agent's row once the computer takes it", async () => {
    const onAnswer = vi.fn(async (): Promise<RemoteSendOutcome> => ({ kind: "done" }));
    const screen = render(<AgentsList view={live} onOpen={vi.fn()} onAnswer={onAnswer} />);
    const reject = [...screen.querySelectorAll("button")].find(
      (each) => each.textContent === "Reject Sorter",
    );
    await act(async () => reject?.click());
    expect(document.activeElement?.getAttribute("data-session")).toBe("sorter");
    const said = [...screen.querySelectorAll('[role="status"]')].map((each) => each.textContent);
    expect(said).toContain("Rejected: Sorter.");
  });

  it("shows nothing without agents", () => {
    const { screen } = show(remoteView());
    expect(screen.querySelector("ul")).toBeNull();
  });
});
