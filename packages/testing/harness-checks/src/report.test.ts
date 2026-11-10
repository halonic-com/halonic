import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ClaudeCodeFindings } from "./claude-code-check.ts";
import type { CodexFindings } from "./codex-check.ts";
import type { TappedRequest } from "./header-tap.ts";
import type { PromptOutcome } from "./prompt-outcome.ts";
import { claudeCodeReport, codexReport, hostsOf, promptVerdict, requestsText } from "./report.ts";

const signInHeaders = ["authorization", "x-api-key"];

const signedCall: TappedRequest = {
  method: "POST",
  path: "/v1/messages",
  headers: { authorization: "present", "x-api-key": "absent" },
  status: 200,
};

const answered: PromptOutcome = {
  result: "answered",
  exitCode: 0,
  requests: [signedCall],
  denied: [],
  modelCalls: 1,
};

const signedOut: PromptOutcome = {
  result: "signed-out",
  exitCode: 1,
  requests: [],
  denied: ["platform.claude.com:443", "statsig.anthropic.com:443"],
  modelCalls: 0,
};

const findings: ClaudeCodeFindings = {
  version: "2.3.1",
  storage: { credentialsFile: "absent", keychainServices: ["Claude Code-credentials"] },
  oauthTokenVariable: "not-used",
  signedInOutside: "yes",
  signedInInside: "no",
  prompt: signedOut,
  refresh: "not-forced",
};

verifies("harness-checks.report", () => {
  it("says through the bridge when a call carrying a sign-in was answered", () => {
    expect(promptVerdict(answered, signInHeaders)).toEqual({ kind: "through-bridge" });
  });

  it("names the refused hosts when the prompt wasn't answered", () => {
    expect(promptVerdict(signedOut, signInHeaders)).toEqual({
      kind: "needs-allowed-sites",
      hosts: ["platform.claude.com", "statsig.anthropic.com"],
    });
  });

  it("is inconclusive, with the reason, otherwise", () => {
    const unsigned = {
      ...answered,
      requests: [{ ...signedCall, headers: { authorization: "absent", "x-api-key": "absent" } }],
    } satisfies PromptOutcome;
    expect(promptVerdict(unsigned, signInHeaders)).toEqual({
      kind: "inconclusive",
      why: "the requests reached the bridge without a sign-in",
    });
    expect(promptVerdict({ ...answered, requests: [] }, signInHeaders)).toEqual({
      kind: "inconclusive",
      why: "no request reached the bridge",
    });
    expect(promptVerdict({ ...answered, result: "failed", modelCalls: 0 }, signInHeaders)).toEqual({
      kind: "inconclusive",
      why: 'the prompt ended as "failed"',
    });
  });

  it("writes each host once, without its port", () => {
    expect(hostsOf(["a.example:443", "a.example:80", "b.example:443"])).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("writes each request as method, path, status and present or absent", () => {
    expect(requestsText([signedCall, { ...signedCall, status: null }])).toBe(
      "`POST /v1/messages` → 200 (authorization: present, x-api-key: absent)<br>" +
        "`POST /v1/messages` → no answer (authorization: present, x-api-key: absent)",
    );
    expect(requestsText([])).toBe("none");
  });

  it("writes a Markdown table with both paths", () => {
    const report = claudeCodeReport(findings, { platform: "darwin", arch: "arm64" });

    expect(report).toContain("| Computer | darwin arm64 |");
    expect(report).toContain(
      '| Keychain entries named "Claude Code…" | `Claude Code-credentials` |',
    );
    expect(report).toContain("| Signed in, inside srt | no |");
    expect(report).toContain(
      "| Sign-in path | **needs provider hosts in `allowedSites`:** `platform.claude.com`, `statsig.anthropic.com` |",
    );
    expect(report).toContain("| Refresh path | not checked (run again with `--expire-sign-in`) |");
  });

  it("says where a forced refresh went", () => {
    const refreshed = claudeCodeReport(
      { ...findings, refresh: { ...signedOut, result: "sign-in-expired" } },
      { platform: "linux", arch: "x64" },
    );
    const answeredRefresh = claudeCodeReport(
      { ...findings, prompt: answered, refresh: answered },
      { platform: "linux", arch: "x64" },
    );
    const impossible = claudeCodeReport(
      { ...findings, refresh: "not-possible" },
      { platform: "linux", arch: "x64" },
    );

    expect(refreshed).toContain(
      "| Refresh path | **goes straight to `platform.claude.com`, `statsig.anthropic.com`**, which the sandbox refused",
    );
    expect(answeredRefresh).toContain("| Sign-in path | **through the bridge** |");
    expect(answeredRefresh).toContain("| Refresh path | **through the bridge** (answered");
    expect(impossible).toContain("the sign-in isn't in `.credentials.json`");
  });

  it("says when Claude Code didn't answer and when the Keychain doesn't apply", () => {
    const report = claudeCodeReport(
      {
        ...findings,
        version: null,
        storage: { credentialsFile: "present", keychainServices: null },
      },
      { platform: "linux", arch: "x64" },
    );

    expect(report).toContain("didn't answer `claude --version` inside srt");
    expect(report).toContain('| Keychain entries named "Claude Code…" | not macOS |');
  });

  it("writes the Codex report with its sign-in kind and its own refresh reason", () => {
    const codex: CodexFindings = {
      version: "0.166.0",
      storage: { credentialsFile: "present", keychainServices: [] },
      signInKind: "chatgpt",
      signedInOutside: "yes",
      signedInInside: "yes",
      prompt: {
        ...answered,
        requests: [{ ...signedCall, path: "/v1/responses", headers: { authorization: "present" } }],
      },
      refresh: "not-possible",
    };

    const report = codexReport(codex, { platform: "linux", arch: "x64" });

    expect(report).toContain("### Harness sign-in check: Codex");
    expect(report).toContain("| `auth.json` in the settings folder | present |");
    expect(report).toContain("| Sign-in in `auth.json` | ChatGPT |");
    expect(report).toContain('| Keychain entries named "Codex…" | none |');
    expect(report).toContain("| Sign-in path | **through the bridge** |");
    expect(report).toContain("`auth.json` holds no ChatGPT sign-in with a `last_refresh`");
  });
});
