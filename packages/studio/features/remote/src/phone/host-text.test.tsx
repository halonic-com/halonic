// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FakePhoneRemote,
  remoteApproval,
  remoteSession,
  remoteView,
} from "../test-support/fake-phone-remote.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentsList } from "./agents-list.tsx";
import { hostLine, hostLineMax, hostMessage, hostTitle, hostTitleMax } from "./host-text.ts";
import type { RemoteEvent } from "./remote-view.ts";
import { RunDetail } from "./run-detail.tsx";

afterEach(unmountAll);

const rightToLeft = String.fromCodePoint(0x202e);
const isolate = String.fromCodePoint(0x2066);
const zeroWidth = String.fromCodePoint(0x200b);
const escapeCharacter = String.fromCodePoint(0x1b);
const nextLine = String.fromCodePoint(0x85);

const now = () => new Date(2026, 10, 21, 14, 5);

function agentSays(seq: number, text: string): RemoteEvent {
  return { seq, at: "2026-11-21T14:03:00.000Z", body: { type: "message", role: "agent", text } };
}

verifies("remote.phone-host-text", () => {
  describe("host text as the phone shows it", () => {
    it("shows bidi controls and other control characters as visible markers", () => {
      expect(hostLine(`Refund${rightToLeft}for Sam`, 40)).toBe("Refund⟦U+202E⟧for Sam");
      expect(hostLine(`a${isolate}b${zeroWidth}c${escapeCharacter}d${nextLine}e`, 40)).toBe(
        "a⟦U+2066⟧b⟦U+200B⟧c⟦U+001B⟧d⟦U+0085⟧e",
      );
    });

    it("marks tab and newline in a one-line field, and keeps a message's lines", () => {
      expect(hostLine("send\tall\nnow", 40)).toBe("send⟦U+0009⟧all⟦U+000A⟧now");
      expect(hostMessage(`First line\nSecond${rightToLeft} line`)).toBe(
        "First line\nSecond⟦U+202E⟧ line",
      );
    });

    it("cuts a long field with a visible …, never inside a marker", () => {
      expect(hostLine("x".repeat(10), 10)).toBe("x".repeat(10));
      expect(hostLine("x".repeat(11), 10)).toBe(`${"x".repeat(10)}…`);
      expect(hostLine(`${"x".repeat(9)}${rightToLeft}tail`, 10)).toBe(`${"x".repeat(9)}⟦U+202E⟧…`);
      expect(hostTitle("t".repeat(hostTitleMax + 5))).toBe(`${"t".repeat(hostTitleMax)}…`);
    });
  });

  it("shows hidden characters and the cap in the Agents row next to Approve", () => {
    const summary = `send_refund: {"to":"Sam${rightToLeft}"}${"!".repeat(hostLineMax)}`;
    const screen = render(
      <AgentsList
        view={remoteView({
          sessions: [remoteSession({ title: `Sorter${isolate}`, state: "waiting" })],
          openApprovals: [
            remoteApproval({ approval: { id: "approval-1", summary, risk: "normal" } }),
          ],
        })}
        onOpen={vi.fn()}
        onAnswer={vi.fn()}
        now={now}
      />,
    );
    const shown = screen.textContent ?? "";
    expect(shown).toContain("Sorter⟦U+2066⟧");
    expect(shown).toContain('send_refund: {"to":"Sam⟦U+202E⟧"}');
    expect(shown).toContain("!…");
    expect(shown).not.toContain(rightToLeft);
    expect(shown).not.toContain(isolate);
  });

  it("shows hidden characters in the run detail's messages and approval summary", () => {
    const remote = new FakePhoneRemote();
    const screen = render(
      <RunDetail
        view={remoteView({
          sessions: [
            remoteSession({
              title: "Sorter",
              state: "waiting",
              events: [agentSays(1, `Sending to Sam${rightToLeft}`)],
            }),
          ],
          openApprovals: [
            remoteApproval({
              answerOnComputer: true,
              approval: { id: "approval-1", summary: `send${zeroWidth}: {}`, risk: "risky" },
            }),
          ],
        })}
        sessionId="session-1"
        label={null}
        onBack={vi.fn()}
        onSend={(sessionId, text) => remote.prompt(sessionId, text)}
        now={now}
      />,
    );
    const shown = screen.textContent ?? "";
    expect(shown).toContain("Sending to Sam⟦U+202E⟧");
    expect(shown).toContain("send⟦U+200B⟧: {}");
    expect(shown).not.toContain(rightToLeft);
    expect(shown).not.toContain(zeroWidth);
  });

  it("renders links in agent text as plain text that opens nothing", () => {
    const links = [
      "See https://example.com/report",
      '<a href="https://example.com">the report</a>',
      "[the report](https://example.com)",
    ];
    const screen = render(
      <RunDetail
        view={remoteView({
          sessions: [
            remoteSession({ events: links.map((text, index) => agentSays(index + 1, text)) }),
          ],
        })}
        sessionId="session-1"
        label={null}
        onBack={vi.fn()}
        onSend={vi.fn()}
        now={now}
      />,
    );
    for (const text of links) expect(screen.textContent).toContain(text);
    expect(screen.querySelector("a, [href]")).toBeNull();
  });
});
