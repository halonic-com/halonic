import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { wslSetupOf } from "./sandbox-wsl-setup-shell.ts";

/** A shell that answers each command from the test, and keeps what it was asked. */
function shell(answers: Record<string, unknown>) {
  const asked: { command: string; args?: Record<string, unknown> }[] = [];
  return {
    asked,
    ipc: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        asked.push(args === undefined ? { command } : { command, args });
        if (!(command in answers)) throw new Error(`no ${command} here`);
        return answers[command];
      },
    },
  };
}

verifies("studio.sandbox-wsl-setup-through-shell", () => {
  it("asks the shell for the WSL setup with no argument, where the shell offers it", async () => {
    const { ipc, asked } = shell({
      sandbox_wsl_setup_offered: true,
      sandbox_wsl_setup: { outcome: "done" },
    });
    const setUp = await wslSetupOf(ipc);
    expect(await setUp?.()).toEqual({ outcome: "done" });
    expect(asked).toEqual([
      { command: "sandbox_wsl_setup_offered" },
      { command: "sandbox_wsl_setup" },
    ]);
  });

  it("reads each of the shell's answers", async () => {
    for (const answer of [
      { outcome: "restart_needed" },
      { outcome: "failed", reason: "other", code: "distro-not-ours", details: "d" },
      { outcome: "failed", reason: "virtualisation-off", details: "d" },
      { outcome: "image_missing" },
      { outcome: "not_started", details: "d" },
      { outcome: "unanswered", exitCode: 3 },
      { outcome: "unanswered" },
    ]) {
      const { ipc } = shell({ sandbox_wsl_setup_offered: true, sandbox_wsl_setup: answer });
      expect(await (await wslSetupOf(ipc))?.()).toEqual(answer);
    }
  });

  it("isn't used where the shell doesn't offer it, or can't say", async () => {
    expect(await wslSetupOf(shell({ sandbox_wsl_setup_offered: false }).ipc)).toBeUndefined();
    expect(await wslSetupOf(shell({}).ipc)).toBeUndefined();
  });

  it("refuses an answer of the wrong shape", async () => {
    for (const answer of [
      { outcome: "installed" },
      { outcome: "failed", reason: "other" },
      { outcome: "done", path: "C:/x" },
    ]) {
      const { ipc } = shell({ sandbox_wsl_setup_offered: true, sandbox_wsl_setup: answer });
      await expect((await wslSetupOf(ipc))?.()).rejects.toThrow("can't read");
    }
  });
});
