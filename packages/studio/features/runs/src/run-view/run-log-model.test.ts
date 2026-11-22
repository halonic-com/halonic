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

  it("shows a bridge failure as an event line with its kind and message", () => {
    const [, line] = runLogLines(
      logOf("run_a_01jd8q", [
        [
          0,
          {
            type: "bridge.failed",
            agent: "writer",
            kind: "internal",
            message: "the tool list could not be read",
          },
        ],
      ]),
    );
    expect(line).toMatchObject({
      kind: "event",
      type: "bridge.failed",
      fields: '{"agent":"writer","kind":"internal","message":"the tool list could not be read"}',
    });
  });

  it("shows a call an agent's asks: in-sandbox let through as an event line with its tool and detail", () => {
    const [, line] = runLogLines(
      logOf("run_a_01jd8q", [
        [
          0,
          {
            type: "harness.allowed",
            agent: "writer",
            tool: "Bash",
            detail: "npm test",
            rule: "asks-in-sandbox",
          },
        ],
      ]),
    );
    expect(line).toMatchObject({
      kind: "event",
      type: "harness.allowed",
      fields: '{"agent":"writer","tool":"Bash","detail":"npm test","rule":"asks-in-sandbox"}',
    });
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

verifies("runs.run-view.key-origin-answered", () => {
  const answered = (answer: "allowed" | "not-allowed"): RunEventBody => ({
    type: "key-origin.answered",
    provider: "Gateway",
    key: "gateway-key",
    origin: "https://gateway.example.com",
    answer,
  });

  it("says an Allow in words, with its time and without who answered", () => {
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, answered("allowed")]]));
    expect(lines[1]).toEqual({
      kind: "words",
      seq: 2,
      time: "10:41:00",
      text: 'Allowed: provider "Gateway" may send key "gateway-key" to https://gateway.example.com.',
    });
  });

  it("says a Don't allow in words too", () => {
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, answered("not-allowed")]]));
    expect(lines[1]).toMatchObject({
      kind: "words",
      text: 'Not allowed: provider "Gateway" can\'t send key "gateway-key" to https://gateway.example.com.',
    });
  });

  it("writes a hidden character in a name as its escape", () => {
    const event = { ...answered("allowed"), key: "gate\u202eway" } as RunEventBody;
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, event]]));
    expect(lines[1]).toMatchObject({ text: expect.stringContaining("gate\\u202eway") });
  });
});

verifies("runs.run-view.key-origin-asked", () => {
  const asked: RunEventBody = {
    type: "key-origin.asked",
    provider: "Gateway",
    key: "gateway-key",
    origin: "https://gateway.example.com",
  };

  it("says the question in words, with its number and time", () => {
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, asked]]));
    expect(lines[1]).toEqual({
      kind: "words",
      seq: 2,
      time: "10:41:00",
      text: 'Allow this address? Asked whether provider "Gateway" may send key "gateway-key" to https://gateway.example.com.',
    });
  });

  it("writes a hidden character in a name as its escape", () => {
    const event = { ...asked, key: "gate\u202eway" } as RunEventBody;
    const lines = runLogLines(logOf("run_a_01jd8q", [[1, event]]));
    expect(lines[1]).toMatchObject({ text: expect.stringContaining("gate\\u202eway") });
  });
});
