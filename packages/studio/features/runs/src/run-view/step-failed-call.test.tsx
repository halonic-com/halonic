// @vitest-environment jsdom
import type { RunEventBody, ToolFailureCause, ToolOutcome } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";
import { StepPanel } from "./step-panel.tsx";

afterEach(unmountAll);

const draft: StepEntry = {
  id: "step-0",
  name: "Draft",
  mark: "failed",
  line: "Failed after 2 s",
  time: "10:40",
  label: "Draft, failed, 10:40, Failed after 2 s",
  groups: [],
};

const called = (tool: string): RunEventBody => ({
  type: "tool.called",
  agent: "writer",
  tool,
  args: { title: "Refund" },
});

const result = (tool: string, outcome: ToolOutcome, cause?: ToolFailureCause): RunEventBody => ({
  type: "tool.result",
  agent: "writer",
  tool,
  result: "Error: connect ECONNREFUSED",
  outcome,
  ...(cause === undefined ? {} : { cause }),
});

const connectorStarted: RunEventBody = {
  type: "connector.started",
  state: "draft",
  agent: "writer",
  connector: "notes-mcp",
  timeoutMs: 60_000,
};

/**
 * The text under each tool call of Draft's panel, by the tool's name. With `openPlugin`, the panel
 * can open a plugin's page, as in a window that opens tabs.
 */
function lines(
  events: readonly (readonly [number, RunEventBody])[],
  openPlugin?: (pluginId: string) => void,
): Record<string, string> {
  const log = logOf("run_a_7k2m9p", [[0, entered("draft")], ...events]);
  const root = render(
    <StepPanel
      entry={draft}
      log={log}
      workflowName={(id) => id}
      openRun={undefined}
      openPlugin={openPlugin}
      onClose={() => {}}
    />,
  );
  const calls = [...root.querySelectorAll("aside li")];
  return Object.fromEntries(
    calls.map((call) => [
      call.querySelector("summary")?.textContent ?? "",
      call.querySelector("p")?.textContent ?? "",
    ]),
  );
}

verifies("runs.run-view.step-failed-call", () => {
  it("says under a call that broke off without an answer which tool and connector it was", () => {
    const shown = lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [0, result("create_note", "unknown")],
    ]);

    expect(shown["create_note"]).toBe(
      "✕ Didn't work: the tool create_note (notes-mcp) broke off without an answer, so it may or may not have done its work.",
    );
  });

  it("says only that it didn't work when the log gives no reason, and never the tool's own text", () => {
    const shown = lines([
      [0, called("search_pages")],
      [0, result("search_pages", "error")],
    ]);

    expect(shown["search_pages"]).toBe("✕ Didn't work.");
    expect(Object.values(shown).join()).not.toContain("ECONNREFUSED");
  });

  it("adds nothing under a call that worked", () => {
    const shown = lines([
      [0, called("send_email")],
      [0, result("send_email", "ok")],
    ]);

    expect(shown).toEqual({ send_email: "" });
  });

  it("draws the ✕ for sighted people only", () => {
    lines([
      [0, called("search_pages")],
      [0, result("search_pages", "error")],
    ]);

    const mark = document.querySelector("aside li p span");
    expect(mark?.textContent?.trim()).toBe("✕");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });
});

verifies("runs.run-view.step-failed-call", () => {
  /** The line under `create_note`, called on notes-mcp, whose result has `cause`. */
  const lineFor = (cause: ToolFailureCause, outcome: ToolOutcome = "error"): string | undefined =>
    lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [0, result("create_note", outcome, cause)],
    ])["create_note"];

  it("says how long a tool had when it ran out of time", () => {
    expect(lineFor({ code: "time-limit", seconds: 60 }, "unknown")).toBe(
      "✕ Didn't work: the tool create_note (notes-mcp) didn't answer within 60 seconds, so it may or may not have done its work.",
    );
    expect(lineFor({ code: "time-limit", seconds: 1 }, "unknown")).toContain("within 1 second,");
  });

  it("says Halonic stopped while the tool was running", () => {
    expect(lineFor({ code: "engine-stopped" }, "unknown")).toBe(
      "✕ Didn't work: Halonic stopped while the tool create_note (notes-mcp) was running, so it may or may not have done its work.",
    );
  });

  it.each([
    ["not-connected", "its connector isn't connected."],
    ["tool-gone", "its connector no longer offers it."],
    ["sending-off", "sending is turned off."],
    ["bad-arguments", "the model gave it arguments that aren't usable."],
  ] as const)("says why a call wasn't made: %s", (why, because) => {
    expect(lineFor({ code: "not-made", why })).toBe(
      `✕ Didn't work: the call to create_note (notes-mcp) wasn't made, because ${because}`,
    );
  });

  it("names the program or the secret a connector that didn't start missed", () => {
    expect(
      lineFor({ code: "connector-not-started", why: "program-missing", name: "acme-notes-mcp" }),
    ).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: its program acme-notes-mcp isn't on this computer.",
    );
    expect(
      lineFor({ code: "connector-not-started", why: "secret-not-set", name: "mailbox-token" }),
    ).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: it needs the secret mailbox-token, which isn't set.",
    );
  });

  it("says only that the connector didn't start when the cause names nothing", () => {
    const plain = "✕ Didn't work: the connector notes-mcp didn't start.";
    expect(lineFor({ code: "connector-not-started", why: "other" })).toBe(plain);
    expect(lineFor({ code: "connector-not-started", why: "program-missing" })).toBe(plain);
  });

  it("names the plugin of a connector that didn't start because of its trust", () => {
    expect(
      lineFor({ code: "connector-not-started", why: "plugin-not-trusted", name: "files" }),
    ).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: its plugin files isn't trusted yet.",
    );
    expect(lineFor({ code: "connector-not-started", why: "plugin-changed", name: "files" })).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: its plugin files changed since you trusted it.",
    );
  });

  it("says the service asked to slow down, as `halonic runs show` says it", () => {
    expect(lineFor({ code: "service-refused", why: "slow-down", retries: 2, sentOnce: true })).toBe(
      "✕ Didn't work: the service asked Halonic to slow down when the tool create_note (notes-mcp) called it, and still did after Halonic tried again twice. Try again in a few minutes. Nothing was sent twice.",
    );
  });

  it("names the plugin, by its name, whose sandbox didn't work when it started", () => {
    expect(lineFor({ code: "connector-not-started", why: "plugin-stopped", name: "Weather" })).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start. The sandbox didn't work when its plugin Weather started.",
    );
  });

  it("shows the plugin in italics, as the connector, and offers no button where tabs can't open", () => {
    lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [
        0,
        result("create_note", "error", {
          code: "connector-not-started",
          why: "plugin-not-trusted",
          name: "files",
        }),
      ],
    ]);

    const line = document.querySelector("aside li p");
    expect([...(line?.querySelectorAll("em") ?? [])].map((em) => em.textContent)).toEqual([
      "notes-mcp",
      "files",
    ]);
    expect(line?.querySelector("code, button")).toBeNull();
  });

  it("makes the plugin's name a link to its page, with the same words and no other button", () => {
    const opened: string[] = [];
    const untrusted = (why: "plugin-not-trusted" | "plugin-changed", tool: string) => [
      [0, called(tool)] as const,
      [0, result(tool, "error", { code: "connector-not-started", why, name: "files" })] as const,
    ];
    const shown = lines(
      [
        [0, connectorStarted],
        ...untrusted("plugin-not-trusted", "create_note"),
        ...untrusted("plugin-changed", "read_note"),
      ],
      (pluginId) => opened.push(pluginId),
    );

    expect(shown["create_note"]).toBe(
      "✕ Didn't work: the connector notes-mcp didn't start: its plugin files isn't trusted yet.",
    );
    const links = [...document.querySelectorAll("aside li p button")];
    expect(links.map((link) => link.textContent)).toEqual(["files", "files"]);
    expect(links[0]?.querySelector("em")?.textContent).toBe("files");
    act(() => {
      for (const link of links) (link as HTMLElement).click();
    });
    expect(opened).toEqual(["files", "files"]);
  });

  it("doesn't link a stopped plugin, whose cause holds its name and not its id", () => {
    lines(
      [
        [0, called("create_note")],
        [
          0,
          result("create_note", "error", {
            code: "connector-not-started",
            why: "plugin-stopped",
            name: "Weather",
          }),
        ],
      ],
      () => {},
    );

    expect(document.querySelector("aside li p button")).toBeNull();
    const names = [...document.querySelectorAll("aside li p em")].map((em) => em.textContent);
    expect(names).toContain("Weather");
  });

  it("links neither a program nor a secret, which have no page", () => {
    lines(
      [
        [0, called("create_note")],
        [
          0,
          result("create_note", "error", {
            code: "connector-not-started",
            why: "program-missing",
            name: "acme-notes-mcp",
          }),
        ],
      ],
      () => {},
    );

    expect(document.querySelector("aside li p button")).toBeNull();
  });

  it("says only that the connector didn't start for a plugin cause without a name", () => {
    const plain = "✕ Didn't work: the connector notes-mcp didn't start.";
    for (const why of ["plugin-not-trusted", "plugin-changed", "plugin-stopped"] as const) {
      expect(lineFor({ code: "connector-not-started", why })).toBe(plain);
    }
  });

  it("names the connector by its tool when the log doesn't name it", () => {
    const shown = lines([
      [0, called("read_note")],
      [0, result("read_note", "error", { code: "connector-not-started", why: "other" })],
    ]);

    expect(shown["read_note"]).toBe(
      "✕ Didn't work: the connector of the tool read_note didn't start.",
    );
  });

  it("shows the program and the secret in code style, with hidden characters escaped", () => {
    lines([
      [0, connectorStarted],
      [0, called("create_note")],
      [
        0,
        result("create_note", "error", {
          code: "connector-not-started",
          why: "secret-not-set",
          name: `mailbox${String.fromCodePoint(0x202e)}token`,
        }),
      ],
    ]);

    const names = [...document.querySelectorAll("aside li p code")].map((code) => code.textContent);
    expect(names).toEqual(["mailbox\\u202etoken"]);
  });

  it("reads a cause it doesn't know as no cause", () => {
    const unknownCause = { code: "melted" } as unknown as ToolFailureCause;

    expect(lineFor(unknownCause)).toBe("✕ Didn't work.");
    expect(lineFor(unknownCause, "unknown")).toContain("broke off without an answer");
  });
});

verifies("runs.run-view.step-failed-call", () => {
  const asked: RunEventBody = {
    type: "approval.requested",
    state: "draft",
    agent: "writer",
    tool: "send_mail",
    connector: "mail",
    args: { to: "support" },
    callId: "call-3",
    resume: { kind: "agent" } as never,
  };
  const answered = (approved: boolean): RunEventBody => ({
    type: "approval.resolved",
    state: "draft",
    agent: "writer",
    tool: "send_mail",
    callId: "call-3",
    approved,
  });
  const programMissing: ToolFailureCause = {
    code: "connector-not-started",
    why: "program-missing",
    name: "acme-mail-mcp",
  };

  it("lists an approved call whose connector didn't start from its approval, with the cause", () => {
    const shown = lines([
      [0, asked],
      [0, answered(true)],
      [0, result("send_mail", "error", programMissing)],
    ]);

    expect(shown).toEqual({
      send_mail:
        "✕ Didn't work: the connector mail didn't start: its program acme-mail-mcp isn't on this computer.",
    });
    expect(document.querySelector("aside li pre")?.textContent).toBe('{\n  "to": "support"\n}');
  });

  it("lists an approved call that was made once, from its own call", () => {
    const shown = lines([
      [0, asked],
      [0, answered(true)],
      [0, called("send_mail")],
      [0, result("send_mail", "error", { code: "engine-stopped" })],
    ]);

    expect(Object.keys(shown)).toEqual(["send_mail"]);
    expect(document.querySelector("aside li pre")?.textContent).toContain("Refund");
  });

  it("doesn't list a rejected call", () => {
    expect(
      lines([
        [0, asked],
        [0, answered(false)],
      ]),
    ).toEqual({});
  });
});
