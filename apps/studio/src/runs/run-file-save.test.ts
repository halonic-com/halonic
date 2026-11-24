import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shellFileSave } from "./run-file-save.ts";

/** A shell that answers `run_file_save` with `answer`, and keeps what it was asked. */
function shell(answer: unknown) {
  const asked: { command: string; args?: Record<string, unknown> }[] = [];
  return {
    asked,
    ipc: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        asked.push(args === undefined ? { command } : { command, args });
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

const hash = "3f".repeat(32);

verifies("studio.desktop-run-file-save", () => {
  it("asks the shell to save the run's file by workspace, run and hash, never a path", async () => {
    const { ipc, asked } = shell({ saved: true });
    const host = shellFileSave(ipc, "/work/acme");
    expect(await host.save("run_w_5r8t2k", hash)).toBe("saved");
    expect(asked).toEqual([
      {
        command: "run_file_save",
        args: { workspace: "/work/acme", runId: "run_w_5r8t2k", hash },
      },
    ]);
  });

  it("reads a closed dialog as cancelled", async () => {
    const { ipc } = shell({ saved: false });
    expect(await shellFileSave(ipc, "/work/acme").save("run_w_5r8t2k", hash)).toBe("cancelled");
  });

  it("rejects with the shell's refusal, or an answer it doesn't know", async () => {
    const refusal = { kind: "unknown_artifact", message: "The run created no file with this id." };
    await expect(
      shellFileSave(shell(Promise.reject(refusal)).ipc, "/w").save("r", hash),
    ).rejects.toEqual(refusal);
    await expect(shellFileSave(shell({}).ipc, "/w").save("r", hash)).rejects.toThrow(
      "The shell answered run_file_save with {}.",
    );
  });
});
