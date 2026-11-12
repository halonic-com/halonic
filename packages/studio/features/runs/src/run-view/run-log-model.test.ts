import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { entered, logOf } from "./run-log.test-helper.ts";
import { runLogLines } from "./run-log-model.ts";

const blockedSite = (host: string, count: number): RunEventBody => ({
  type: "sandbox.blocked",
  state: "install",
  agent: "writer",
  block: { kind: "network", host, port: 443 },
  count,
});

verifies("runs.run-view.run-log", () => {
  it("numbers each event by its seq, with its time, its type and its own fields", () => {
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, entered("draft")]]));
    expect(lines).toEqual([
      {
        kind: "event",
        seq: 1,
        time: "10:40:00",
        type: "run.started",
        fields:
          '{"hubId":"acme","workflowId":"support-reply","input":{},"kind":"run","definitionsVersion":"v1"}',
      },
      {
        kind: "event",
        seq: 2,
        time: "10:41:00",
        type: "state.entered",
        fields: '{"state":"draft"}',
      },
    ]);
  });

  it("writes a hidden or direction-changing character as its escape", () => {
    const override = String.fromCodePoint(0x202e);
    const [, line] = runLogLines(
      logOf("run_a_01jd8q", [[0, { type: "event.received", event: `ok${override}gnp.exe` }]]),
    );
    expect(line).toMatchObject({ fields: '{"event":"ok\\u202egnp.exe"}' });
  });

  it("shows a step's blocked sites once, where its first was blocked", () => {
    const lines = runLogLines(
      logOf("run_a_01jd8q", [
        [1, entered("install")],
        [1, blockedSite("registry.npmjs.org", 1)],
        [1, blockedSite("registry.npmjs.org", 12)],
        [2, { type: "run.completed", state: "install", context: {} }],
      ]),
    );
    expect(lines.map((line) => (line.kind === "event" ? line.type : "blocked"))).toEqual([
      "run.started",
      "state.entered",
      "blocked",
      "run.completed",
    ]);
    expect(lines[2]).toMatchObject({
      kind: "blocked",
      seq: 3,
      step: { sites: [{ host: "registry.npmjs.org", tries: 12 }] },
    });
  });

  it("keeps a blocked file as an event of its own", () => {
    const lines = runLogLines(
      logOf("run_a_01jd8q", [
        [1, entered("install")],
        [
          1,
          {
            type: "sandbox.blocked",
            state: "install",
            agent: "writer",
            block: { kind: "file", path: "~/.ssh/id_ed25519", access: "read" },
            count: 1,
          },
        ],
      ]),
    );
    expect(lines.at(-1)).toMatchObject({ kind: "event", type: "sandbox.blocked" });
  });
});
