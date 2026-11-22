import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { CheckFact } from "../check-facts.ts";
import { checkReport } from "./check-report.ts";

const at = new Date(2026, 10, 19, 10, 44);
const header = { about: "Halonic 0.1.0 · macOS arm64", at, demo: true };

/** The first run after a key with no credit stopped the run (first-run-progress 4.1). */
const noCredit: readonly CheckFact[] = [
  { check: "engine", running: true },
  { check: "workspace", status: "ok", name: "Acme", trust: "trusted" },
  {
    check: "models",
    servers: undefined,
    keys: [{ provider: "Anthropic", keyStored: true }],
    sampleAnswers: false,
    tests: [{ provider: "Anthropic", outcome: "no-credit", at: new Date(2026, 10, 19, 10, 42) }],
  },
  {
    check: "default-model",
    status: "failed",
    target: { uses: "provider", provider: "anthropic", name: "Anthropic", local: false },
    cause: "models.no-key",
  },
  {
    check: "last-run",
    status: "failed",
    runId: "r1",
    step: 2,
    steps: 3,
    stepName: "Write reply",
    durationMs: 6800,
    failure: { reason: "out-of-credit", provider: "Anthropic" },
    cause: "last-run.out-of-credit",
    causeShownOn: "models",
  },
  { check: "not-checked", parts: ["sandbox", "harnesses"] },
];

verifies("check-computer.report", () => {
  it("writes the first run's report with one cause counted once", () => {
    expect(checkReport(noCredit, header)).toBe(
      [
        "Check this computer",
        "Halonic 0.1.0 · macOS arm64",
        "2026-11-19 10:44",
        "1 problem",
        "",
        "✓ Engine          running",
        "✓ Workspace       demo · can open · trusted",
        "✕ Models          Anthropic: key accepted, account has no credit, 10:42",
        "                  Fix: add credit on Anthropic's site, then test again.",
        "– Default model   points at Anthropic · not checked until Models works",
        "– Last run        failed at step 2 of 3 · because of Models",
        "– Not checked     sandbox, harnesses · not used here",
      ].join("\n"),
    );
  });

  it("counts a server that isn't answering and a workspace not trusted yet", () => {
    const report = checkReport(
      [
        { check: "workspace", status: "warning", name: "My workspace", trust: "new" },
        {
          check: "models",
          servers: {
            check: "models",
            status: "failed",
            ready: [],
            problems: [
              {
                problem: "unreachable",
                provider: "ollama",
                name: "Ollama",
                address: "localhost:11434",
              },
            ],
          },
          keys: [],
          sampleAnswers: false,
          tests: [],
        },
        {
          check: "google",
          step: 4,
          steps: 7,
          startedAt: new Date(2026, 10, 8),
          email: "x@example.com",
        },
      ],
      { ...header, demo: false },
    );

    expect(report.split("\n").slice(3)).toEqual([
      "1 problem · 1 warning",
      "",
      "! Workspace       not trusted yet",
      "✕ Models          Ollama isn't answering at localhost:11434",
      "                  Fix: start Ollama on this computer, then check again.",
      "– Google          setup at step 4 of 7, started 8 Nov",
    ]);
  });

  it("names only known providers, and addresses only on this computer", () => {
    const report = checkReport(
      [
        {
          check: "models",
          servers: {
            check: "models",
            status: "ok",
            ready: [
              {
                provider: "studio",
                name: "LM Studio (Acme laptop)",
                answering: true,
                address: "gpu.acme.internal:1234",
                models: [{ name: "acme-tuned" }, { name: "qwen3" }],
              },
            ],
            problems: [],
          },
          keys: [],
          sampleAnswers: false,
          tests: [],
        },
      ],
      header,
    );

    expect(report).toContain(
      "✓ Models          another provider answering at an address on your network · 2 models loaded · not tested yet",
    );
  });

  it("says No problems found, Sample answers and a passed test as info and passes", () => {
    const report = checkReport(
      [
        {
          check: "models",
          servers: undefined,
          keys: [],
          sampleAnswers: true,
          tests: [],
        },
        { check: "default-model", status: "ok", target: { uses: "sample-answers" } },
      ],
      header,
    );

    expect(report.split("\n").slice(3)).toEqual([
      "No problems found",
      "",
      "– Models          built-in test model · no key or network needed",
      "– Default model   uses Sample answers",
    ]);
  });

  it("refuses a cloud default under Local only, names the sandbox by its reason code, and a timed-out check warns", () => {
    const report = checkReport(
      [
        {
          check: "default-model",
          status: "failed",
          target: { uses: "provider", provider: "anthropic", name: "Anthropic", local: false },
          cause: "default-model.local-only",
        },
        { check: "sandbox", status: "warning", timedOut: true },
        { check: "sandbox", status: "failed", reason: "bubblewrap-missing", missing: [] },
      ],
      header,
    );

    expect(report.split("\n").slice(3)).toEqual([
      "2 problems · 1 warning",
      "",
      "✕ Default model   points at Anthropic · Local only refuses it",
      "! Sandbox         didn't answer in 5 seconds",
      "✕ Sandbox         can't start · bubblewrap-missing",
    ]);
  });
});
