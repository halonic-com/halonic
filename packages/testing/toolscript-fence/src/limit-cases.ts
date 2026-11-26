import { ToolScriptStop } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, vi } from "vitest";
import { fenceIt } from "./fence-case.ts";
import { held, type MakeToolScriptIsolate, recorder, runScript, script } from "./harness.ts";

/** Calls `ctx.acme.ping` `count` times, one after the other. */
function sequentialCalls(count: number): string {
  return script(`for (let i = 0; i < ${count}; i += 1) await ctx.acme.ping(i); return "done";`);
}

/** Starts `count` calls to `ctx.acme.slow` at once and waits for all. */
function parallelCalls(count: number): string {
  return script(`
    const calls = [];
    for (let i = 0; i < ${count}; i += 1) calls.push(ctx.acme.slow());
    await Promise.all(calls);
    return "done";`);
}

/** ADR 2.3: each limit stops the run with its own reason; waiting on the host isn't CPU. */
export function limitCases(make: MakeToolScriptIsolate): void {
  verifies("toolscript-fence.limits", () => {
    isolateLimitCases(make);
    hostCountCases(make);
    waitCases(make);
    stopCases(make);
  });
}

/** CPU, memory and stack: the isolate's own limits. */
function isolateLimitCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("stops a busy loop at the CPU limit", async () => {
    const result = await runScript(make, script("for (;;) {}"), { limits: { cpuMs: 100 } });
    expect(result).toMatchObject({ ok: false, reason: "limit.cpu" });
  });

  it("stops a script that holds far more than its memory limit", async () => {
    // 64 separate 1 MB strings, held at once, under an 8 MB limit. The loop is
    // finite, so only a hard limit can stop it: a soft one lets it finish.
    const code = script(`
      const all = [];
      for (let i = 0; i < 64; i += 1) all.push("x".repeat(1 << 20));
      return all.length;`);
    const result = await runScript(make, code, { limits: { memoryBytes: 8 * 1024 * 1024 } });
    expect(result).toMatchObject({ ok: false, reason: "limit.memory" });
  });

  it("stops a recursion that never ends", async () => {
    const code = script("function down(n) { return down(n + 1) + 1; } return down(0);");
    const result = await runScript(make, code);
    expect(result).toMatchObject({ ok: false, reason: "limit.stack" });
  });
}

/** Calls, pending promises, input, output and log: counted by the host. */
function hostCountCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("allows 32 pending host calls and stops at the 33rd", async () => {
    const allowed = held();
    const running = runScript(make, parallelCalls(32), {
      functions: { acme: { slow: allowed.fn } },
    });
    await vi.waitFor(() => expect(allowed.calls).toBe(32));
    allowed.release();
    expect(await running).toMatchObject({ ok: true, output: "done" });
    const over = held();
    const result = await runScript(make, parallelCalls(33), {
      functions: { acme: { slow: over.fn } },
    });
    expect(result).toMatchObject({ ok: false, reason: "limit.promises" });
  });

  it("allows 50 host calls for an agent and stops at the 51st", async () => {
    const functions = { acme: { ping: recorder().fn } };
    expect(await runScript(make, sequentialCalls(50), { functions })).toMatchObject({ ok: true });
    const result = await runScript(make, sequentialCalls(51), { functions });
    expect(result).toMatchObject({ ok: false, reason: "limit.calls" });
  });

  it("refuses an input over 16 KB", async () => {
    const result = await runScript(make, script("return 1;"), { input: "x".repeat(16 * 1024) });
    expect(result).toMatchObject({ ok: false, reason: "limit.input" });
  });

  it("refuses an output over 64 KB", async () => {
    const result = await runScript(make, script(`return "x".repeat(64 * 1024);`));
    expect(result).toMatchObject({ ok: false, reason: "limit.output" });
  });

  it("keeps 200 log lines, cuts each to 300 characters and stops at the 201st", async () => {
    const code = script(`for (let i = 0; i < 200; i += 1) ctx.log("x".repeat(400)); return 1;`);
    const result = await runScript(make, code);
    expect(result.ok).toBe(true);
    expect(result.log).toHaveLength(200);
    expect(result.log[0]).toHaveLength(300);
    const over = await runScript(
      make,
      script("for (let i = 0; i < 201; i += 1) ctx.log(i); return 1;"),
    );
    expect(over).toMatchObject({ ok: false, reason: "limit.log" });
  });
}

/** The wall clock, and host waits that aren't CPU. */
function waitCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("stops at the wall clock while the script waits", async () => {
    const never = held();
    const code = script("await ctx.acme.never(); return 1;");
    const result = await runScript(make, code, {
      functions: { acme: { never: never.fn } },
      limits: { wallClockMs: 50 },
    });
    expect(result).toMatchObject({ ok: false, reason: "limit.wall-clock" });
  });

  it("doesn't count time spent waiting on the host as CPU", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // The host "waits" three seconds; with a CPU limit of 100 ms the run still finishes.
      const wait = async () => {
        vi.setSystemTime(Date.now() + 3_000);
        return "waited";
      };
      const code = script("return await ctx.acme.wait();");
      const result = await runScript(make, code, {
        functions: { acme: { wait } },
        limits: { cpuMs: 100 },
      });
      expect(result).toMatchObject({ ok: true, output: "waited" });
    } finally {
      vi.useRealTimers();
    }
  });
}

/** A host function's ToolScriptStop and the caller's cancel. */
function stopCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("stops with a host function's listed reason, and with a cancel", async () => {
    const decline = async () => {
      throw new ToolScriptStop("toolscript.declined");
    };
    const declined = await runScript(make, script("await ctx.acme.write(); return 1;"), {
      functions: { acme: { write: decline } },
    });
    expect(declined).toMatchObject({ ok: false, reason: "toolscript.declined" });
    const cancel = new AbortController();
    const cancelling = async () => {
      cancel.abort();
      return new Promise<null>(() => {});
    };
    const cancelled = await runScript(make, script("await ctx.acme.wait(); return 1;"), {
      functions: { acme: { wait: cancelling } },
      signal: cancel.signal,
    });
    expect(cancelled).toMatchObject({ ok: false, reason: "toolscript.cancelled" });
  });

  it("never runs a script whose signal is already aborted", async () => {
    const acme = recorder();
    const cancel = new AbortController();
    cancel.abort();
    const result = await runScript(make, script("await ctx.acme.ping('ran'); return 1;"), {
      functions: { acme: { ping: acme.fn } },
      signal: cancel.signal,
    });
    expect(result).toMatchObject({ ok: false, reason: "toolscript.cancelled" });
    expect(acme.calls).toEqual([]);
  });
}
