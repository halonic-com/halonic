import { clampWaitMs, declarationProblems } from "@halonicjs/adapter-integration-kit";
import { recordingFileSchema } from "@halonicjs/format/recording";
import { type IntegrationHost, maxIntegrationWaitMs } from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { canaryFor, canaryMark } from "./canaries.ts";
import { fail } from "./failure.ts";
import { fakeWait } from "./fake-wait.ts";
import { loadSubject, policyOf, sheetOf } from "./load.ts";
import { replayTransport } from "./recording.ts";
import {
  type CaseRun,
  type ConformanceSubject,
  runCase,
  scenarioOf,
  type ToolCase,
} from "./run.ts";
import { scanIntegrationSource } from "./source-scan.ts";

/**
 * The sheet passes its schema, and the integration is exactly what it says:
 * kit version, name, version, and each tool's text, arguments, `risk` and
 * `untrusted`, as the kit's loader checks them. Every case calls a declared
 * tool, and every recording is a valid `halonic.recording/1` file of this
 * integration.
 */
export function checkDeclaration(subject: ConformanceSubject): void {
  const sheet = sheetOf(subject);
  const problems = declarationProblems(sheet, subject.integration);
  if (problems.length > 0) fail(problems.map((problem) => problem.message).join("\n"));
  checkRecordings(subject);
  const tools = new Set(sheet.tools.map((tool) => tool.name));
  for (const toolCase of subject.cases) {
    if (!tools.has(toolCase.tool)) fail(`a case calls "${toolCase.tool}", which isn't declared`);
    if (scenarioOf(subject, toolCase) === undefined)
      fail(`a case replays the scenario "${toolCase.scenario}", which has no recording`);
  }
}

/** Every recording passes the format's schema and belongs to this integration. */
function checkRecordings(subject: ConformanceSubject): void {
  for (const [index, recording] of subject.recordings.entries()) {
    const parsed = parse(recordingFileSchema, recording);
    if (!parsed.ok) {
      const issues = parsed.error.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      fail(`recording ${index + 1} isn't a valid halonic.recording/1 file:\n${issues.join("\n")}`);
    }
    if (recording.integration !== subject.integration.name)
      fail(`the recording "${recording.scenario}" is for "${recording.integration}"`);
  }
}

/**
 * Every host in the sheet resolves with the subject's settings: a
 * `{ fromSetting }` host has a URL, plain `http` goes only to a local
 * address, and a secret goes over it only to this machine.
 */
export function checkPolicy(subject: ConformanceSubject): void {
  policyOf(subject);
}

/** Connecting sends nothing, and closing twice is safe. */
export async function checkConnectIsQuiet(subject: ConformanceSubject): Promise<void> {
  const replay = replayTransport(undefined);
  const { host } = loadSubject(subject, replay.transport);
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
  if (run.unusedExchanges > 0) {
    fail(
      `"${toolCase.tool}" made ${run.unusedExchanges} request(s) fewer than the recording "${toolCase.scenario}" has`,
    );
  }
  if (toolCase.waits !== undefined && run.waits.join() !== toolCase.waits.join()) {
    fail(
      `"${toolCase.tool}" waited [${run.waits.join(", ")}] ms, the case expects [${toolCase.waits.join(", ")}]`,
    );
  }
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
 * without passing the provider's body through.
 */
export async function checkProviderErrors(
  subject: ConformanceSubject,
  toolCase: ToolCase,
): Promise<void> {
  const providerBody = `PROVIDER-BODY ${Object.keys(sheetOf(subject).secrets).map(canaryFor).join(" ")}`;
  const recorded = scenarioOf(subject, toolCase);
  const recording = recorded && {
    ...recorded,
    exchanges: recorded.exchanges.map((exchange) => ({
      ...exchange,
      response: {
        status: 500,
        headers: {},
        body: { kind: "text" as const, contentType: "text/plain", value: providerBody },
      },
    })),
  };
  const run = await runCase(subject, toolCase, recording ? { recording } : {});
  checkNoBypass(run);
  const shown = `${run.result ?? ""} ${run.error === undefined ? "" : messageOf(run.error)}`;
  if (shown.includes("PROVIDER-BODY") || shown.includes(canaryMark)) {
    fail(`"${toolCase.tool}" passed the provider's error body through`);
  }
}

/**
 * The host's `wait`, real and fake alike, waits at most 30 s and rejects
 * with the signal's reason when the signal is already aborted or aborts
 * during the wait.
 */
export async function checkHostWait(subject: ConformanceSubject): Promise<void> {
  const clamps: readonly [number, number][] = [
    [Number.NaN, 0],
    [-1, 0],
    [2_000, 2_000],
    [Number.POSITIVE_INFINITY, maxIntegrationWaitMs],
  ];
  const fake = fakeWait();
  for (const [ms] of clamps) await fake.wait(ms);
  for (const [index, [ms, expected]] of clamps.entries()) {
    if (clampWaitMs(ms) !== expected || fake.waits[index] !== expected)
      fail(`wait(${ms}) must wait ${expected} ms`);
  }
  const { host } = loadSubject(subject, replayTransport(undefined).transport);
  for (const wait of [host.wait, fake.wait]) {
    const already = new Error("aborted before the wait");
    await expectRejection(wait(maxIntegrationWaitMs, AbortSignal.abort(already)), already);
  }
  const controller = new AbortController();
  const during = new Error("aborted during the wait");
  const waiting = host.wait(maxIntegrationWaitMs, controller.signal);
  controller.abort(during);
  await expectRejection(waiting, during);
}

async function expectRejection(waiting: ReturnType<IntegrationHost["wait"]>, reason: Error) {
  const outcome = await waiting.then(
    () => "resolved",
    (thrown: unknown) => (thrown === reason ? "rejected" : `rejected with ${messageOf(thrown)}`),
  );
  if (outcome !== "rejected")
    fail(`wait must reject with the signal's reason ("${reason.message}") but ${outcome}`);
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
  const policy = policyOf(subject);
  const shown = `${run.result ?? ""}\n${run.error === undefined ? "" : messageOf(run.error)}`;
  if (shown.includes(canaryMark)) fail("a secret value appears in the tool's result or error");
  if (JSON.stringify(run.log).includes(canaryMark))
    fail("a secret value appears in the request log");
  for (const request of run.seen) {
    const url = new URL(request.url);
    if (request.url.includes(canaryMark))
      fail(`a secret value was put in the URL of ${url.host}${url.pathname}`);
    const carried = `${JSON.stringify(request.headers)}\n${request.body ?? ""}`;
    for (const [secret, { hosts }] of Object.entries(policy.secrets)) {
      if (carried.includes(canaryFor(secret)) && !hosts.includes(url.host)) {
        fail(`the secret "${secret}" went to ${url.host}, which it may not go to`);
      }
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
