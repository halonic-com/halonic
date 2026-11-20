import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DoctorWorkspace } from "./doctor-service.ts";
import { doctorCheckLimitMs } from "./doctor-time-limit.ts";
import { anthropic, doctor, ollama, workspace } from "./testing/doctor-fixtures.ts";

/** A check that never answers. */
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

/**
 * The report of `doctor`, with the time limit reached once the checks that
 * answer have: the timers still set then are those of the checks that hang.
 */
async function afterLimit(
  { service, timers }: ReturnType<typeof doctor>,
  workspace: DoctorWorkspace | null,
) {
  const checking = service.check(workspace);
  await new Promise((resolve) => setImmediate(resolve));
  timers.fire();
  return checking;
}

verifies("app.doctor-time-limit", () => {
  it("warns on a harness whose detect() never answers, and still gives the other lines", async () => {
    const report = await afterLimit(
      doctor({ codexHarness: { id: "codex", name: "Codex", detect: never } }),
      null,
    );

    expect(report.harnesses).toEqual({ check: "harnesses", status: "warning", timedOut: true });
    expect(report.sandbox.status).toBe("ok");
    expect(report.disk.status).toBe("ok");
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("gives each check 5 seconds, and clears every timer of a check that answers", async () => {
    const machine = doctor({ sandboxCheck: never });
    const checking = machine.service.check(null);

    expect(machine.timers.delays()).toEqual(Array(7).fill(doctorCheckLimitMs));
    expect(doctorCheckLimitMs).toBe(5_000);
    await new Promise((resolve) => setImmediate(resolve));
    expect(machine.timers.delays()).toEqual([doctorCheckLimitMs]);
    machine.timers.fire();
    const report = await checking;

    expect(report.sandbox).toEqual({ check: "sandbox", status: "warning", timedOut: true });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("times out the Disk line, but not the Models line of providers off this computer, when the resource report hangs", async () => {
    const report = await afterLimit(
      doctor({ read: never, secrets: { ANTHROPIC_API_KEY: "sk-test" } }),
      workspace({
        providers: [anthropic],
        aliases: [{ alias: "smart", provider: "anthropic" }],
      }),
    );

    expect(report.disk).toEqual({ check: "disk", status: "warning", timedOut: true });
    expect(report.models?.status).toBe("ok");
  });

  it("times out the Models line too when a provider runs on this computer", async () => {
    const report = await afterLimit(
      doctor({ read: never }),
      workspace({ providers: [ollama], aliases: [{ alias: "fast", provider: "ollama" }] }),
    );

    expect(report.models).toEqual({ check: "models", status: "warning", timedOut: true });
    expect(report.workspace?.status).toBe("ok");
  });

  it("times out the Secrets line when the secret store never answers for a connector's secret", async () => {
    const report = await afterLimit(
      doctor({ hanging: ["files-token"] }),
      workspace({
        secrets: [{ secret: "files-token", usedBy: [{ kind: "connector", id: "files" }] }],
      }),
    );

    expect(report.secrets).toEqual({ check: "secrets", status: "warning", timedOut: true });
    expect(report.workspace?.status).toBe("ok");
    expect(report.summary.needsFixing).toBe(false);
  });

  it("still throws what a check throws in time", async () => {
    const report = doctor({
      sandboxCheck: () => Promise.reject(new Error("broken")),
    }).service.check(null);

    await expect(report).rejects.toThrow("broken");
  });
});
