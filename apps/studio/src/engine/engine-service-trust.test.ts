import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.test-helper.ts";

verifies("studio.untrusted-starts-nothing", () => {
  const reply = { hubId: "support", workflowId: "reply" };
  /** Kim's workspace (HAL-12407): a keyless model server on this computer. */
  const keylessLocal = () =>
    acmeFiles(
      { writer: "model: ollama/qwen3\n" },
      {
        "providers/ollama.yaml": [
          "id: ollama",
          "type: openai-compatible",
          "baseUrl: http://localhost:11434/v1",
          "local: true",
          "",
        ].join("\n"),
      },
    );
  const refusal = {
    kind: "denied",
    message: "This workspace isn't trusted yet, so nothing was started.",
  };

  /** A client that records each address it is asked to call. */
  function recordingHttp() {
    const sent: string[] = [];
    return {
      sent,
      http: {
        fetch: async (url: string) => {
          sent.push(url);
          throw new TypeError("Failed to fetch");
        },
      },
    };
  }

  it("refuses a run of an untrusted workspace, sends nothing and gives the lock back", async () => {
    const shell = fakeShell();
    const { sent, http } = recordingHttp();
    const service = serviceOn(shell, keylessLocal(), {
      http,
      isTrusted: async () => false,
      mayStart: async () => false,
    });

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);

    expect(sent).toEqual([]);
    expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    expect(shell.calls).not.toContain("run_append");
  });

  it("refuses a routine's Run now the same way", async () => {
    const shell = fakeShell();
    const service = serviceOn(shell, keylessLocal(), { mayStart: async () => false });

    await expect(
      service.startRoutine(
        { workflow: { ...reply, input: {} } },
        { routineKey: "support/daily", at: "2026-11-18T09:00:00.000Z" },
      ),
    ).rejects.toMatchObject(refusal);
    expect(shell.calls).not.toContain("run_append");
  });

  it("asks about the workspace the engine loaded, and fails closed when the check fails", async () => {
    const asked: unknown[] = [];
    const service = serviceOn(fakeShell(), keylessLocal(), {
      mayStart: async (workspace) => {
        asked.push(workspace);
        throw new Error("The trust record can't be read.");
      },
    });

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveProperty("files");
  });

  it("refuses the next start once the workspace may start nothing, with the engine still open", async () => {
    let trusted = true;
    const service = serviceOn(fakeShell(), acmeFiles(), { mayStart: async () => trusted });
    await service.startRun(reply, {});

    trusted = false;

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);
    await service.close();
  });
});
