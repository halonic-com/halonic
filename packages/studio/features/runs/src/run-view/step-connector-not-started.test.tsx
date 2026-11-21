// @vitest-environment jsdom
import type { RunEventBody, ToolFailureCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { StepPanel } from "./step-panel.tsx";

afterEach(unmountAll);

const draft: StepEntry = {
  id: "step-0",
  name: "Draft",
  mark: "done",
  line: "Done in 2 s",
  time: "10:40",
  label: "Draft, done, 10:40, Done in 2 s",
  groups: [],
};

type StartCause = Extract<ToolFailureCause, { code: "connector-not-started" }>;

const listingFailed = (connector: string, cause: StartCause): RunEventBody => ({
  type: "connector.listing-failed",
  agent: "writer",
  connector,
  cause,
});

const modelCall: readonly (readonly [number, RunEventBody])[] = [
  [0, { type: "llm.request", agent: "writer", model: "claude-sonnet", messages: [] } as never],
  [
    0,
    {
      type: "llm.response",
      agent: "writer",
      model: "claude-sonnet",
      usage: { inputTokens: 10, outputTokens: 2 },
    } as never,
  ],
];

/** Draft's panel for `events`, and the quiet lines above its tool calls. */
function panel(events: readonly (readonly [number, RunEventBody])[]) {
  const log = logOf("run_a_7k2m9p", [[0, entered("draft")], ...events]);
  const root = render(
    <StepPanel
      entry={draft}
      log={log}
      workflowName={(id) => id}
      openRun={undefined}
      onClose={() => {}}
    />,
  );
  const lines = [...root.querySelectorAll("aside section > p")].map((line) => line.textContent);
  return { root, lines };
}

verifies("runs.run-view.step-connector-not-started", () => {
  it("says above the tool calls which program a connector that couldn't list its tools missed", () => {
    const { root, lines } = panel([
      [
        0,
        listingFailed("notes", {
          code: "connector-not-started",
          why: "program-missing",
          name: "acme-notes-mcp",
        }),
      ],
      ...modelCall,
    ]);

    expect(lines).toEqual([
      "✕ Couldn't list the tools from notes: its program acme-notes-mcp isn't on this computer.",
    ]);
    expect(root.querySelector("aside section > p")?.previousElementSibling?.textContent).toBe(
      "Tool calls",
    );
    expect(root.textContent).not.toContain("This step made no model or tool calls.");
  });

  it("names the secret that isn't set, in code style", () => {
    const { root, lines } = panel([
      [
        0,
        listingFailed("mailbox", {
          code: "connector-not-started",
          why: "secret-not-set",
          name: "mailbox-token",
        }),
      ],
    ]);

    expect(lines).toEqual([
      "✕ Couldn't list the tools from mailbox: it needs the secret mailbox-token, which isn't set.",
    ]);
    expect(root.querySelector("aside section > p code")?.textContent).toBe("mailbox-token");
  });

  it("says only that it couldn't list the tools when the cause names nothing or can't be read", () => {
    const melted = { code: "melted" } as unknown as StartCause;

    expect(
      panel([[0, listingFailed("notes", { code: "connector-not-started", why: "other" })]]).lines,
    ).toEqual(["✕ Couldn't list the tools from notes."]);
    unmountAll();
    expect(panel([[0, listingFailed("notes", melted)]]).lines).toEqual([
      "✕ Couldn't list the tools from notes.",
    ]);
  });

  it("says it once for each connector, whatever the number of turns", () => {
    const missing: StartCause = { code: "connector-not-started", why: "other" };

    const { lines } = panel([
      [0, listingFailed("notes", missing)],
      ...modelCall,
      [0, listingFailed("notes", missing)],
      [0, listingFailed("mailbox", missing)],
      ...modelCall,
    ]);

    expect(lines).toEqual([
      "✕ Couldn't list the tools from notes.",
      "✕ Couldn't list the tools from mailbox.",
    ]);
  });

  it("leaves it out when an approved call's line already says that connector didn't start", () => {
    const cause: StartCause = {
      code: "connector-not-started",
      why: "program-missing",
      name: "acme-mail-mcp",
    };

    const { root, lines } = panel([
      [
        0,
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          connector: "mail",
          args: {},
          callId: "call-3",
          resume: { kind: "agent" } as never,
        },
      ],
      [
        0,
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          callId: "call-3",
          approved: true,
        },
      ],
      [0, listingFailed("mail", cause)],
      [
        0,
        {
          type: "tool.result",
          agent: "writer",
          tool: "send_mail",
          result: "",
          outcome: "error",
          cause,
        },
      ],
    ]);

    expect(lines).toEqual([]);
    expect(root.querySelector("aside li p")?.textContent).toContain(
      "the connector mail didn't start",
    );
  });

  it("escapes hidden characters in the connector's and the program's names", () => {
    const rlo = String.fromCodePoint(0x202e);

    const { lines } = panel([
      [
        0,
        listingFailed(`notes${rlo}`, {
          code: "connector-not-started",
          why: "program-missing",
          name: `acme${rlo}mcp`,
        }),
      ],
    ]);

    expect(lines).toEqual([
      "✕ Couldn't list the tools from notes\\u202e: its program acme\\u202emcp isn't on this computer.",
    ]);
  });
});
