import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { isFolderNotOpen } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeFiles, fakeShell, serviceOn } from "./engine-service.testing.ts";

/** The shell's refusal of a folder that isn't open in the window, as Remove trust leaves it. */
const notOpen = { kind: "folder_not_open", message: "/acme isn't open in this window." };

const untrusted = {
  kind: "denied",
  code: "workspace.untrusted",
  message: "This workspace isn't trusted yet, so nothing was started.",
};

const reply = { hubId: "support", workflowId: "reply" };

/** Acme's files, until `close` plays Remove trust closing the folder a trust grant opened. */
function closableFiles() {
  const files = acmeFiles();
  let closed = false;
  const refuse = () => {
    throw Object.assign(new Error("Couldn't read the folder."), {
      kind: "denied",
      cause: notOpen,
    });
  };
  const definitions = Object.assign(Object.create(MemoryDefinitionStore.prototype), files, {
    list: (...args: Parameters<MemoryDefinitionStore["list"]>) =>
      closed ? refuse() : files.list(...args),
    read: (...args: Parameters<MemoryDefinitionStore["read"]>) =>
      closed ? refuse() : files.read(...args),
  }) as MemoryDefinitionStore;
  return { definitions, close: () => (closed = true) };
}

/** A shell whose stores refuse the folder once `close` is called, as after Remove trust. */
function closableShell() {
  const shell = fakeShell();
  let closed = false;
  const ipc = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (closed && command.startsWith("run_")) throw notOpen;
      return shell.ipc.invoke(command, args);
    },
  };
  return { shell, ipc, close: () => (closed = true) };
}

verifies("studio.untrusted-starts-nothing", () => {
  describe("a start the shell refuses because Remove trust closed the folder", () => {
    it("is the untrusted refusal when the engine isn't open yet", async () => {
      const files = closableFiles();
      const service = serviceOn(fakeShell(), files.definitions, { isTrustedNow: () => false });
      files.close();

      await expect(service.startRun(reply, {})).rejects.toMatchObject(untrusted);
    });

    it("is the untrusted refusal when the lock refuses the folder first", async () => {
      const service = serviceOn(fakeShell({ refusal: notOpen }), acmeFiles(), {
        isTrustedNow: () => false,
      });

      // The chat's way in: Try it opens the engine for a start.
      await expect(service.openForStart()).rejects.toMatchObject(untrusted);
    });

    it("is the untrusted refusal on an open engine whose workspace needs no trust", async () => {
      const shell = closableShell();
      let trusted = true;
      const service = serviceOn(shell.shell, acmeFiles(), {
        ipc: shell.ipc,
        isTrustedNow: () => trusted,
      });
      await service.startRun(reply, {});
      trusted = false;
      shell.close();

      await expect(service.startRun(reply, {})).rejects.toMatchObject(untrusted);
      await expect(service.send("run1", "approve")).rejects.toMatchObject(untrusted);
      await service.close();
    });

    it("stays the shell's refusal, a failure Halonic can't explain, while the workspace is trusted", async () => {
      const files = closableFiles();
      const service = serviceOn(fakeShell(), files.definitions, { isTrustedNow: () => true });
      files.close();

      const refusal = await service.startRun(reply, {}).catch((error: unknown) => error);

      expect(isFolderNotOpen(refusal)).toBe(true);
      expect(refusal).not.toMatchObject({ code: "workspace.untrusted" });
    });
  });
});
