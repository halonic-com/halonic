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
import type { RemoteEvent, RemoteView } from "./remote-view.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

afterEach(unmountAll);

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
  const screen = render(<AgentsList view={view} onAnswer={onAnswer} now={() => now} />);
  const rows = [...screen.querySelectorAll("li")];
  const button = (label: string) =>
    [...screen.querySelectorAll("button")].find((each) => each.textContent === label);
  return { screen, rows, button, onAnswer };
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
  });

  it("reads the line from the end, the oldest open approval, then the agent's newest message", () => {
    expect(
      agentLine(remoteSession({ state: "failed", updatedAt: "not a date" }), undefined, now),
    ).toBe("Failed");
    expect(agentLine(sorter, sorterAsks, now)).toBe("Send 4 replies");
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
    // An agent that ended keeps its end time alone: no second time beside it (C672).
    expect(rows[2]?.querySelector(".sr-only")?.textContent).toBe("Writer, Finished 13:40, Done");
    expect(agentRowLine(stale, remoteSession(), undefined, now)).toBe("as of 14:02");
    expect(agentRowLine({ ...stale, asOf: undefined }, reporter, undefined, now)).toBe(
      "Writing the weekly report",
    );
  });

  it("keeps Approve and Deny off with the reason under them, and sends nothing", () => {
    const { button, onAnswer } = show(staleView(live, "reconnecting"));
    const approve = button("Approve");
    expect(approve?.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(approve?.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("You can answer once your phone reconnects.");
    act(() => approve?.click());
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("says to answer a risky approval on the computer", () => {
    const risky = remoteApproval({
      ...sorterAsks,
      canAnswer: false,
      offReason: ANSWER_RISKY_ON_COMPUTER,
    });
    const { screen, button } = show({ ...live, openApprovals: [risky] });
    expect(button("Deny")?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.textContent).toContain("Answer this on your computer.");
  });

  it("sends an answer while it can, and not again while it is on its way", () => {
    const { button, onAnswer } = show(live);
    act(() => button("Deny")?.click());
    expect(onAnswer).toHaveBeenCalledWith("sorter", "send-replies", "deny");

    unmountAll();
    const sent = remoteApproval({ ...sorterAsks, canAnswer: false, sent: "deny" });
    const again = show({ ...live, openApprovals: [sent] });
    expect(again.button("Approve")).toBeUndefined();
    act(() => again.screen.querySelector("button")?.click());
    expect(again.onAnswer).not.toHaveBeenCalled();
  });

  it("shows nothing without agents", () => {
    const { screen } = show(remoteView());
    expect(screen.querySelector("ul")).toBeNull();
  });
});
