import type {
  ToolScriptArtifact,
  ToolScriptAudience,
  ToolScriptCapability,
  ToolScriptData,
  ToolScriptHost,
  ToolScriptLimits,
  ToolScriptRunRequest,
  ToolScriptRunResult,
  ToolScriptWrite,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type FakeToolScript, sha256Hex } from "./fake-tool-script-host.ts";
import { contractScripts, type ScriptName } from "./tool-script-fixtures.ts";

/**
 * A script the suite runs: `code` for a real isolate, and `simulate`, the
 * same behaviour for the fake host, which runs no code.
 */
export interface ToolScriptFixture {
  readonly code: string;
  readonly codeHash: string;
  readonly simulate: FakeToolScript;
}

/** What a suite needs from a host under test. */
export interface ToolScriptHostHarness {
  host: ToolScriptHost;
  /** Called when the test ends, to stop workers or loaders. */
  close?: () => Promise<void>;
}

/** Creates a new host for one test. It must run (pin) every given fixture, by `codeHash`. */
export type MakeToolScriptHost = (
  fixtures: readonly ToolScriptFixture[],
) => Promise<ToolScriptHostHarness>;

/** Everything one test needs: the host, its registry, what was sent and confirmed, and a way to run a script. */
interface Bench {
  host: ToolScriptHost;
  sent: ToolScriptData[];
  confirmed: (readonly ToolScriptWrite[])[];
  /** Resolves when `acme.wait@1` has been called; `release` lets it answer. */
  waiting: Promise<AbortSignal>;
  run(name: ScriptName, options?: RunOptions): Promise<ToolScriptRunResult>;
}

interface RunOptions {
  input?: ToolScriptData;
  uses?: readonly string[];
  audience?: ToolScriptAudience;
  limits?: Partial<ToolScriptLimits>;
  requestLimits?: Partial<ToolScriptLimits>;
  decline?: boolean;
  codeHash?: string;
  registryAudience?: ToolScriptAudience;
  signal?: AbortSignal;
}

const allUses = ["acme.get-note@1", "acme.set-note@1", "acme.wait@1", "acme.broken@1"];
const other = (audience: ToolScriptAudience): ToolScriptAudience =>
  audience === "user" ? "agent" : "user";

async function fixtures(): Promise<Record<ScriptName, ToolScriptFixture>> {
  const entries = await Promise.all(
    Object.entries(contractScripts).map(async ([name, [code, simulate]]) => {
      return [name, { code, codeHash: await sha256Hex(code), simulate }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ScriptName, ToolScriptFixture>;
}

function registry(
  audience: ToolScriptAudience,
  bench: Pick<Bench, "sent">,
  waited: (signal: AbortSignal) => void,
) {
  const capability = (
    id: string,
    kind: "read" | "write",
    call: ToolScriptCapability["call"],
  ): [string, ToolScriptCapability] => [id, { id, audience, kind, risk: "routine", call }];
  return new Map([
    capability("acme.get-note@1", "read", async () => ({ text: "a note" })),
    capability("acme.set-note@1", "write", async (args) => {
      bench.sent.push(args);
      return { saved: true };
    }),
    capability("acme.wait@1", "read", (_args, { signal }) => {
      waited(signal);
      return new Promise(() => undefined);
    }),
    capability("acme.broken@1", "read", async () => {
      throw new Error("acme is down");
    }),
    [
      "acme.other@1",
      {
        id: "acme.other@1",
        audience: other(audience),
        kind: "read",
        risk: "routine",
        call: async () => null,
      },
    ],
  ]);
}

/** Runs one test against a new host and closes it afterwards. */
function withBench(make: MakeToolScriptHost, body: (bench: Bench) => Promise<void>) {
  return async () => {
    const byName = await fixtures();
    const harness = await make(Object.values(byName));
    const { host } = harness;
    let waited: (signal: AbortSignal) => void = () => undefined;
    const sent: ToolScriptData[] = [];
    const confirmed: (readonly ToolScriptWrite[])[] = [];
    const waiting = new Promise<AbortSignal>((resolve) => {
      waited = resolve;
    });
    const capabilities = registry(host.audience, { sent }, (signal) => waited(signal));
    const run = (name: ScriptName, options: RunOptions = {}) => {
      const fixture = byName[name];
      const artifact: ToolScriptArtifact = {
        header: {
          format: "halonic.toolscript/1",
          id: `acme.${name.toLowerCase()}`,
          version: 1,
          audience: options.audience ?? host.audience,
          uses: options.uses ?? allUses,
          // A user header must declare `touches` for any write (S14); empty entries allow any target.
          touches: Object.fromEntries(allUses.map((id) => [id, {}])),
          ...(options.limits === undefined ? {} : { limits: options.limits }),
        },
        code: fixture.code,
        sourceHash: fixture.codeHash,
        codeHash: options.codeHash ?? fixture.codeHash,
        profileVersion: 1,
      };
      const request: ToolScriptRunRequest = {
        runId: `run-${name}`,
        artifact,
        registry: { audience: options.registryAudience ?? host.audience, capabilities },
        input: options.input ?? {},
        ...(options.requestLimits === undefined ? {} : { limits: options.requestLimits }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        confirm: async (writes) => {
          confirmed.push(writes);
          return options.decline !== true;
        },
      };
      return host.run(request);
    };
    try {
      await body({ host, sent, confirmed, waiting, run });
    } finally {
      await harness.close?.();
    }
  };
}

/**
 * The contract every {@link ToolScriptHost} passes: the fake, the QuickJS
 * host (T5) and the Cloudflare host (T11). It runs the host's own audience
 * against an invented `acme` registry, with no network. What only an isolate
 * can show (CPU, memory, stack, `eval`, globals) is the fence suite's.
 */
export function toolScriptHostContract(name: string, make: MakeToolScriptHost): void {
  verifies("contracts.tool-script-host", () => {
    describe(`ToolScriptHost contract: ${name}`, () => {
      runCases(make);
      refusalCases(make);
      limitCases(make);
      failureCases(make);
    });
  });
}

function runCases(make: MakeToolScriptHost): void {
  it(
    "returns the output, the capabilities called and the log",
    withBench(make, async ({ run, sent }) => {
      const result = await run("readWrite");
      expect(result).toEqual({
        ok: true,
        output: { text: "a note" },
        calls: ["acme.get-note@1", "acme.set-note@1"],
        log: ["copied"],
      });
      expect(sent).toEqual([{ name: "b", text: "a note" }]);
    }),
  );

  it(
    "confirms each write with exactly the copy it sends, and no read",
    withBench(make, async ({ run, confirmed }) => {
      await run("readWrite");
      expect(confirmed).toEqual([
        [{ capability: "acme.set-note@1", risk: "routine", args: { name: "b", text: "a note" } }],
      ]);
    }),
  );

  it(
    "stops at a declined write and sends nothing",
    withBench(make, async ({ run, sent }) => {
      const result = await run("readWrite", { decline: true });
      expect(result).toMatchObject({
        ok: false,
        reason: "toolscript.declined",
        calls: ["acme.get-note@1"],
      });
      expect(sent).toEqual([]);
    }),
  );

  it(
    "gives ctx only the capabilities in uses",
    withBench(make, async ({ run, sent }) => {
      const result = await run("readWrite", { uses: ["acme.get-note@1"] });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.script-error" });
      expect(sent).toEqual([]);
    }),
  );
}

function refusalCases(make: MakeToolScriptHost): void {
  const refused = (reason: string, options: (host: ToolScriptHost) => RunOptions) =>
    withBench(make, async ({ host, run, confirmed }) => {
      const result = await run("readWrite", options(host));
      expect(result).toEqual({ ok: false, reason, calls: [], log: [] });
      expect(confirmed).toEqual([]);
    });

  it(
    "refuses an artifact of the other audience",
    refused("toolscript.wrong-audience", (host) => ({ audience: other(host.audience) })),
  );
  it(
    "refuses a registry of the other audience",
    refused("toolscript.wrong-audience", (host) => ({ registryAudience: other(host.audience) })),
  );
  it(
    "refuses a capability of the other audience in uses",
    refused("toolscript.wrong-audience", () => ({ uses: ["acme.other@1"] })),
  );
  it(
    "refuses code that doesn't match its codeHash",
    refused("toolscript.code-hash-mismatch", () => ({ codeHash: "0".repeat(64) })),
  );
  it(
    "refuses a capability the registry lacks",
    refused("toolscript.unknown-capability", () => ({ uses: ["acme.missing@1"] })),
  );
  it(
    "refuses a uses entry that isn't a capability id",
    refused("toolscript.bad-artifact", () => ({ uses: ["Acme.GetNote"] })),
  );
  it(
    "refuses a header limit that isn't a positive whole number",
    refused("toolscript.bad-artifact", () => ({ limits: { calls: 0 } })),
  );
  it(
    "refuses input over the input limit",
    refused("limit.input", () => ({ input: { text: "z".repeat(17 * 1024) } })),
  );
}

function limitCases(make: MakeToolScriptHost): void {
  it(
    "stops at the header's call limit, which the request can't raise",
    withBench(make, async ({ run }) => {
      const input = { times: 5, args: { name: "a" } };
      const result = await run("callWithInput", {
        input,
        limits: { calls: 2 },
        requestLimits: { calls: 10 },
      });
      expect(result).toMatchObject({
        ok: false,
        reason: "limit.calls",
        calls: ["acme.get-note@1", "acme.get-note@1"],
      });
    }),
  );

  it(
    "refuses arguments over 8 KB or 8 levels deep, and functions",
    withBench(make, async ({ run }) => {
      let deep: ToolScriptData = "a";
      for (let level = 0; level < 9; level += 1) deep = { deep };
      for (const args of [{ name: "x".repeat(9000) }, deep]) {
        const result = await run("callWithInput", { input: { times: 1, args } });
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-argument", calls: [] });
      }
      expect(await run("passFunction")).toMatchObject({
        ok: false,
        reason: "toolscript.bad-argument",
      });
    }),
  );

  it(
    "stops at the output limit and refuses an output that isn't plain data",
    withBench(make, async ({ run }) => {
      expect(await run("output", { input: { size: 65 * 1024 } })).toMatchObject({
        reason: "limit.output",
      });
      expect(await run("output", { input: { function: true } })).toMatchObject({
        reason: "toolscript.bad-output",
      });
      expect(await run("output", { input: { size: 3 } })).toMatchObject({
        ok: true,
        output: "xxx",
      });
    }),
  );

  it(
    "cuts long log lines and stops at the log limit",
    withBench(make, async ({ run }) => {
      const long = await run("logs", { input: { lines: 1, length: 400 } });
      expect(long).toMatchObject({ ok: true, log: ["y".repeat(300)] });
      const many = await run("logs", { input: { lines: 3, length: 1 }, limits: { logLines: 2 } });
      expect(many).toMatchObject({ ok: false, reason: "limit.log", log: ["y", "y"] });
    }),
  );
}

function failureCases(make: MakeToolScriptHost): void {
  it(
    "reports a thrown error by its message only, and ctx.fail as failed",
    withBench(make, async ({ run }) => {
      expect(await run("throws")).toEqual({
        ok: false,
        reason: "toolscript.script-error",
        message: "broken on purpose",
        calls: [],
        log: [],
      });
      expect(await run("fails")).toMatchObject({
        reason: "toolscript.failed",
        message: "nothing to copy",
      });
    }),
  );

  it(
    "reports a capability that fails by the code only, without its message",
    withBench(make, async ({ run }) => {
      const result = await run("callsBroken");
      expect(result).toEqual({
        ok: false,
        reason: "toolscript.capability-failed",
        calls: ["acme.broken@1"],
        log: [],
      });
    }),
  );

  it(
    "stops on cancel and aborts the capability's signal",
    withBench(make, async ({ run, waiting }) => {
      const cancel = new AbortController();
      const result = run("waits", { signal: cancel.signal });
      const capabilitySignal = await waiting;
      cancel.abort();
      expect(await result).toMatchObject({
        ok: false,
        reason: "toolscript.cancelled",
        calls: ["acme.wait@1"],
      });
      expect(capabilitySignal.aborted).toBe(true);
    }),
  );

  it(
    "runs nothing when cancelled before it starts",
    withBench(make, async ({ run }) => {
      const result = await run("readWrite", { signal: AbortSignal.abort() });
      expect(result).toEqual({ ok: false, reason: "toolscript.cancelled", calls: [], log: [] });
    }),
  );
}
