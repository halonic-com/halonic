import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { elevateSetupOf } from "./sandbox-elevate-shell.ts";

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

verifies("studio.sandbox-setup-through-shell", () => {
  it("asks the shell for the setup with the verb only, where the host runs beside it", async () => {
    const { ipc, asked } = shell({
      wsl_removal_offered: true,
      sandbox_elevate: { outcome: "exited", exitCode: 0 },
    });
    const elevate = await elevateSetupOf(ipc);
    expect(await elevate?.()).toEqual({ outcome: "exited", exitCode: 0 });
    expect(asked).toContainEqual({ command: "sandbox_elevate", args: { verb: "setup" } });
  });

  it("isn't used where the host doesn't run beside the shell, or the shell can't say", async () => {
    expect(await elevateSetupOf(shell({ wsl_removal_offered: false }).ipc)).toBeUndefined();
    expect(await elevateSetupOf(shell({}).ipc)).toBeUndefined();
  });

  it("refuses an answer of the wrong shape", async () => {
    const { ipc } = shell({
      wsl_removal_offered: true,
      sandbox_elevate: { outcome: "exited", exitCode: -1 },
    });
    await expect((await elevateSetupOf(ipc))?.()).rejects.toThrow("can't read");
  });
});
