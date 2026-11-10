import type { ClaudeCodeFindings, PromptOutcome } from "./claude-code-check.ts";
import type { TappedRequest } from "./header-tap.ts";

/** The check's answer for one harness: does its sign-in go through the bridge, or does the agent need provider hosts? */
export type Verdict =
  | { kind: "through-bridge" }
  | { kind: "needs-allowed-sites"; hosts: string[] }
  | { kind: "inconclusive"; why: string };

/** The computer the check ran on, as the report names it. */
export interface Machine {
  platform: string;
  arch: string;
}

/**
 * The verdict on one prompt through the bridge (requirement
 * `harness-checks.report`): through the bridge when it was answered and a
 * model call carrying a sign-in reached the bridge; provider hosts needed
 * when it wasn't answered and the sandbox refused connections; otherwise
 * inconclusive, with the reason.
 */
export function promptVerdict(outcome: PromptOutcome, signInHeaders: readonly string[]): Verdict {
  const signedCall = outcome.requests.some(
    (request) =>
      request.status !== null && request.status < 400 && carriesSignIn(request, signInHeaders),
  );
  if (outcome.result === "answered" && signedCall && outcome.modelCalls > 0) {
    return { kind: "through-bridge" };
  }
  if (outcome.result !== "answered" && outcome.denied.length > 0) {
    return { kind: "needs-allowed-sites", hosts: hostsOf(outcome.denied) };
  }
  if (outcome.requests.length === 0) {
    return { kind: "inconclusive", why: "no request reached the bridge" };
  }
  if (!outcome.requests.some((request) => carriesSignIn(request, signInHeaders))) {
    return { kind: "inconclusive", why: "the requests reached the bridge without a sign-in" };
  }
  return { kind: "inconclusive", why: `the prompt ended as "${outcome.result}"` };
}

/** Whether the request carried one of the headers a sign-in goes in. */
function carriesSignIn(request: TappedRequest, signInHeaders: readonly string[]): boolean {
  return signInHeaders.some((name) => request.headers[name] === "present");
}

/** The host names of `host:port` entries, each once. */
export function hostsOf(denied: readonly string[]): string[] {
  return [...new Set(denied.map((entry) => entry.replace(/:\d+$/, "")))];
}

/** The headers Claude Code can send a sign-in in. */
const claudeSignInHeaders = ["authorization", "x-api-key"];

/**
 * The Claude Code report as Markdown, safe to paste into a task: names,
 * paths, hosts, status codes and present or absent, never a value.
 */
export function claudeCodeReport(findings: ClaudeCodeFindings, machine: Machine): string {
  const signIn = promptVerdict(findings.prompt, claudeSignInHeaders);
  const rows: [string, string][] = [
    ["Computer", `${machine.platform} ${machine.arch}`],
    ["Claude Code", findings.version ?? "didn't answer `claude --version` inside srt"],
    ["`.credentials.json` in the settings folder", findings.storage.credentialsFile],
    ['Keychain entries named "Claude Code…"', keychainText(findings.storage.keychainServices)],
    ["`CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`)", findings.oauthTokenVariable],
    ["Signed in, outside the sandbox", findings.signedInOutside],
    ["Signed in, inside srt", findings.signedInInside],
    ["Prompt through the bridge", promptText(findings.prompt)],
    ["Requests at the bridge", requestsText(findings.prompt.requests)],
    ["Hosts the sandbox refused", deniedText(findings.prompt.denied)],
    ["Sign-in path", verdictText(signIn)],
    ["Refresh path", refreshText(findings.refresh)],
  ];
  return [
    "### Harness sign-in check: Claude Code",
    "",
    "| Question | Answer |",
    "|---|---|",
    ...rows.map(([question, answer]) => `| ${question} | ${answer} |`),
    "",
  ].join("\n");
}

function keychainText(services: string[] | null): string {
  if (services === null) return "not macOS";
  return services.length === 0 ? "none" : services.map((name) => `\`${name}\``).join(", ");
}

function promptText(outcome: PromptOutcome): string {
  const exit = outcome.exitCode === null ? "no exit code" : `exit ${outcome.exitCode}`;
  return `${outcome.result} (${exit}, ${outcome.modelCalls} model call(s) recorded by the bridge)`;
}

/** Each request as method, path, the status and the headers it carried, one per line in the cell. */
export function requestsText(requests: readonly TappedRequest[]): string {
  if (requests.length === 0) return "none";
  return requests
    .map((request) => {
      const status = request.status === null ? "no answer" : String(request.status);
      const headers = Object.entries(request.headers)
        .map(([name, presence]) => `${name}: ${presence}`)
        .join(", ");
      return `\`${request.method} ${request.path}\` → ${status} (${headers})`;
    })
    .join("<br>");
}

function deniedText(denied: readonly string[]): string {
  return denied.length === 0 ? "none" : denied.map((host) => `\`${host}\``).join(", ");
}

function verdictText(verdict: Verdict): string {
  switch (verdict.kind) {
    case "through-bridge":
      return "**through the bridge**";
    case "needs-allowed-sites":
      return `**needs provider hosts in \`allowedSites\`:** ${verdict.hosts.map((host) => `\`${host}\``).join(", ")}`;
    case "inconclusive":
      return `inconclusive: ${verdict.why}`;
  }
}

function refreshText(refresh: ClaudeCodeFindings["refresh"]): string {
  if (refresh === "not-forced") return "not checked (run again with `--expire-sign-in`)";
  if (refresh === "not-possible") {
    return "not checked: the sign-in isn't in `.credentials.json`, so its expiry can't be set";
  }
  const verdict = promptVerdict(refresh, claudeSignInHeaders);
  const facts = `${promptText(refresh)}; requests: ${requestsText(refresh.requests)}; refused: ${deniedText(refresh.denied)}`;
  if (verdict.kind === "needs-allowed-sites") {
    return `**goes straight to ${verdict.hosts.map((host) => `\`${host}\``).join(", ")}**, which the sandbox refused (${facts})`;
  }
  return `${verdictText(verdict)} (${facts})`;
}
