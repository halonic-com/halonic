import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { CheckFact } from "../check-facts.ts";
import { checkReport } from "./check-report.ts";

// What must never reach the report (first-run-progress 4.3). They are put together at run time,
// so the repo's leak guard doesn't read them as a real key or a real home folder.
const key = ["sk", "ant", "api03", "Q".repeat(32)].join("-");
const email = ["jane.doe", "acme.example"].join("@");
const step = "Draft the Acme refund reply";
const workspace = "Acme Secret Project";
const home = ["", "Users", "jane", "acme"].join("/");
const leaks = { key, email, step, workspace, home };

/** One text holding every leak, for every field a person or a program can fill. */
const all = Object.values(leaks).join(" ");

/** Every line, with each name, address, error text and sentence filled with the leaks. */
const leaky: readonly CheckFact[] = [
  { check: "engine", running: false },
  {
    check: "workspace",
    status: "failed",
    name: all,
    trust: "changed",
    windowsDrive: home,
    fileProblems: 2,
    tooManyFilesToWatch: 50_000,
  },
  {
    check: "models",
    servers: {
      check: "models",
      status: "failed",
      ready: [
        { provider: all, name: all, answering: true, address: `${all}:1`, models: [{ name: all }] },
        { provider: all, name: all, keyStored: true },
      ],
      problems: [
        { problem: "unreachable", provider: all, name: all, address: `${home}:11434` },
        { problem: "no-key", alias: all, provider: all, name: all },
        { problem: "key-unreadable", provider: all, name: all, secret: all },
        { problem: "no-alias", alias: all },
      ],
    },
    keys: [
      { provider: all, keyStored: true },
      { provider: email, keyStored: false },
      { provider: key, keyStored: "unreadable" },
    ],
    sampleAnswers: true,
    tests: [
      { provider: all, outcome: "no-credit", at: new Date(2026, 10, 22) },
      { provider: email, outcome: "key-refused", at: new Date(2026, 10, 22) },
    ],
  },
  {
    check: "default-model",
    status: "failed",
    target: { uses: "provider", provider: all, name: all, local: true },
    cause: "models.unreachable",
  },
  {
    check: "last-run",
    status: "failed",
    runId: all,
    step: 2,
    steps: 3,
    stepName: step,
    agentName: all,
    durationMs: 6800,
    failure: { reason: "key-refused", provider: all, secret: key, model: all, alias: all },
    cause: `last-run.${all}`,
  },
  { check: "sandbox", status: "failed", reason: "other", missing: [all] },
  {
    check: "harnesses",
    status: "warning",
    installed: [{ harness: all, name: all, version: all }],
    problems: [
      { problem: "missing", agent: all, harness: all, name: all },
      { problem: "failed", harness: all, name: all, error: all },
      { problem: "unsupported", harness: all, name: all, version: all, supported: all },
      { problem: "model-refused", agentId: all, agent: all, alias: all, reason: all, fix: all },
      {
        problem: "signed-out",
        agent: all,
        harness: all,
        name: all,
        signIn: { program: all, args: [all], folderVariable: all },
        settingsFolder: home,
      },
      { problem: "searches-web", agent: all, alias: all, model: all, provider: all },
    ],
  },
  { check: "network", status: "warning", problem: "proxy-unusable", variable: all, reason: all },
  { check: "network", status: "warning", problem: "proxy-not-http", variable: all, scheme: all },
  { check: "google", step: 4, steps: 7, startedAt: new Date(2026, 10, 8), email },
];

verifies("check-computer.report", () => {
  describe("holds no key, email address, step name, workspace name or path", () => {
    const report = checkReport(leaky, {
      about: "Halonic 0.1.0 · macOS arm64",
      at: new Date(),
      demo: false,
    });

    for (const [kind, leak] of Object.entries(leaks)) {
      it(`leaves out the ${kind}`, () => {
        expect(report).not.toContain(leak);
      });
    }

    it("leaves out anything key-shaped, any email address and any absolute path", () => {
      expect(report).not.toMatch(/sk-[A-Za-z0-9-]{8,}/);
      expect(report).not.toMatch(/[^\s@]+@[^\s@]+\.[a-z]+/);
      expect(report).not.toMatch(/(^|\s)\/[A-Za-z]/m);
    });

    it("still says what each line found, without the names", () => {
      expect(report).toContain("another provider: key can't be read");
      expect(report).toContain("failed at step 2 of 3 · cause unknown");
      expect(report).toContain("setup at step 4 of 7, started 8 Nov");
    });
  });
});
