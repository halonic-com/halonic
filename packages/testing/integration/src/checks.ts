import { createIntegrationHost, namePattern } from "@halonicjs/adapter-integration-kit";
import { canaryFor, canaryMark, canarySecrets } from "./canaries.ts";
import { replayTransport } from "./recording.ts";
import { type CaseRun, type ConformanceSubject, runCase, type ToolCase } from "./run.ts";
import { scanIntegrationSource } from "./source-scan.ts";

/** A conformance check failed. The message says what to fix. */
export class ConformanceFailure extends Error {
  override readonly name = "ConformanceFailure";
}

function fail(message: string): never {
  throw new ConformanceFailure(message);
}

const versionPattern = /^\d+\.\d+\.\d+$/;
const label = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const hostPattern = new RegExp(`^${label}(?:\\.${label})+(?::\\d{1,5})?$`);

/** The integration is what its sheet says: name, version, and the same tools with the same risk. */
export function checkDeclaration(subject: ConformanceSubject): void {
  const { integration, policy, declaredTools } = subject;
  if (integration.name !== policy.name) {
    fail(`the integration is named "${integration.name}" but its sheet says "${policy.name}"`);
  }
  if (!namePattern.test(integration.name))
    fail(`"${integration.name}" is not lower-case words joined by -`);
  if (!versionPattern.test(integration.version))
    fail(`version "${integration.version}" is not major.minor.patch`);
  const implemented = new Map(integration.tools.map((tool) => [tool.name, tool]));
  if (implemented.size !== integration.tools.length) fail("two tools have the same name");
  const declared = new Map(declaredTools.map((tool) => [tool.name, tool]));
  for (const name of new Set([...implemented.keys(), ...declared.keys()])) {
    const code = implemented.get(name);
    const sheet = declared.get(name);
    if (code === undefined)
      fail(`the sheet declares the tool "${name}" but the integration doesn't offer it`);
    if (sheet === undefined)
      fail(`the integration offers the tool "${name}" but the sheet doesn't declare it`);
    if (code.risk !== sheet.risk)
      fail(`"${name}" has risk "${code.risk}" in code but "${sheet.risk}" in the sheet`);
    if ((code.untrusted ?? false) !== (sheet.untrusted ?? false)) {
      fail(`"${name}" differs in "untrusted" between code and sheet`);
    }
  }
  for (const toolCase of subject.cases) {
    if (!implemented.has(toolCase.tool))
      fail(`a case calls "${toolCase.tool}", which isn't declared`);
  }
}

/** The sheet's hosts are exact names, each secret goes only to declared hosts, and the names are valid. */
export function checkPolicy(subject: ConformanceSubject): void {
  const { policy } = subject;
  for (const host of policy.hosts) {
    if (!hostPattern.test(host))
      fail(`"${host}" is not an exact lower-case host name (no wildcards, no scheme)`);
  }
  for (const [secret, { hosts }] of Object.entries(policy.secrets)) {
    if (!namePattern.test(secret))
      fail(`the secret name "${secret}" is not lower-case words joined by -`);
    for (const host of hosts) {
      if (!policy.hosts.includes(host))
        fail(`the secret "${secret}" may go to "${host}", which isn't a declared host`);
    }
  }
  for (const token of policy.tokens) {
    if (!namePattern.test(token))
      fail(`the token name "${token}" is not lower-case words joined by -`);
  }
}

/** Connecting sends nothing, and closing twice is safe. */
export async function checkConnectIsQuiet(subject: ConformanceSubject): Promise<void> {
  const replay = replayTransport(subject.recordings);
  const { host } = createIntegrationHost({
    policy: subject.policy,
    transport: replay.transport,
    secrets: canarySecrets,
    tokens: { get: async () => null, set: async () => {}, remove: async () => {} },
    ...(subject.settings ? { settings: subject.settings } : {}),
  });
  const connection = subject.integration.connect(host);
  await connection.close();
  await connection.close();
  if (replay.seen.length > 0)
    fail(`connecting sent ${replay.seen.length} request(s); wait for the first call`);
}

/**
 * The tool answers from the recordings, only through its host, with no
 * refused request and no secret anywhere it doesn't belong.
 */
export async function checkCase(subject: ConformanceSubject, toolCase: ToolCase): Promise<string> {
  const run = await runCase(subject, toolCase);
  checkNoBypass(run);
  checkNoLeak(subject, run);
  if (run.error !== undefined) fail(`"${toolCase.tool}" failed: ${messageOf(run.error)}`);
  const result = run.result ?? fail(`"${toolCase.tool}" returned nothing`);
  toolCase.check?.(result);
  return result;
}

/** An aborted call rejects. */
export async function checkAbort(subject: ConformanceSubject, toolCase: ToolCase): Promise<void> {
  const run = await runCase(subject, toolCase, {
    signal: AbortSignal.abort(new Error("aborted by the suite")),
  });
  checkNoBypass(run);
  if (run.error === undefined) fail(`"${toolCase.tool}" ignored an aborted signal`);
}

/**
 * When the provider answers with an error, the tool fails or answers
 * without passing the provider's body through (plan 11).
 */
export async function checkProviderErrors(
  subject: ConformanceSubject,
  toolCase: ToolCase,
): Promise<void> {
  const providerBody = `PROVIDER-BODY ${Object.keys(subject.policy.secrets).map(canaryFor).join(" ")}`;
  const recordings = subject.recordings.map((recording) => ({
    request: recording.request,
    response: { status: 500, headers: { "content-type": "text/plain" }, body: providerBody },
  }));
  const run = await runCase(subject, toolCase, { recordings });
  checkNoBypass(run);
  const shown = `${run.result ?? ""} ${run.error === undefined ? "" : messageOf(run.error)}`;
  if (shown.includes("PROVIDER-BODY") || shown.includes(canaryMark)) {
    fail(`"${toolCase.tool}" passed the provider's error body through`);
  }
}

/** The source uses nothing that reaches past its host. */
export function checkSources(subject: ConformanceSubject): void {
  const findings = scanIntegrationSource(subject.sources ?? {});
  if (findings.length > 0) {
    fail(findings.map((f) => `${f.file}:${f.line}: ${f.rule}`).join("\n"));
  }
}

function checkNoBypass(run: CaseRun): void {
  if (run.globalCalls.length > 0)
    fail(`the integration used the global ${run.globalCalls.join(", ")}; use host.http`);
  const refused = run.log.filter((entry) => entry.outcome === "refused");
  if (refused.length > 0) {
    fail(
      refused.map((e) => `the kit refused ${e.method} ${e.host}${e.path}: ${e.refusal}`).join("\n"),
    );
  }
}

function checkNoLeak(subject: ConformanceSubject, run: CaseRun): void {
  const shown = `${run.result ?? ""}\n${run.error === undefined ? "" : messageOf(run.error)}`;
  if (shown.includes(canaryMark)) fail("a secret value appears in the tool's result or error");
  if (JSON.stringify(run.log).includes(canaryMark))
    fail("a secret value appears in the request log");
  for (const request of run.seen) {
    const url = new URL(request.url);
    if (request.url.includes(canaryMark))
      fail(`a secret value was put in the URL of ${url.host}${url.pathname}`);
    const carried = `${JSON.stringify(request.headers)}\n${request.body ?? ""}`;
    for (const [secret, { hosts }] of Object.entries(subject.policy.secrets)) {
      if (carried.includes(canaryFor(secret)) && !hosts.includes(url.host)) {
        fail(`the secret "${secret}" went to ${url.host}, which it may not go to`);
      }
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
