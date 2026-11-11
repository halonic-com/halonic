import type { DefinitionWatch, WorkspaceFileChange } from "@halonicjs/ports";
import { contentDigest, errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriDefinitionStore } from "./definition-store.ts";
import { FakeFileShell } from "./fake-file-shell.test-helper.ts";
import { ShellWatch } from "./shell-watch.ts";

const acme = "/workspaces/acme";

const sha256 = {
  async sha256(data: Uint8Array) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A listener that keeps what it hears and lets a test wait for the next batch or failure. */
class Heard {
  readonly batches: (readonly WorkspaceFileChange[])[] = [];
  readonly failures: Error[] = [];
  #wake: (() => void) | undefined;

  readonly changed = (changes: readonly WorkspaceFileChange[]): void => {
    this.batches.push(changes);
    this.#wake?.();
  };

  readonly failed = (error: Error): void => {
    this.failures.push(error);
    this.#wake?.();
  };

  /** Resolves once the listener has heard `count` batches and failures in all. */
  async until(count: number): Promise<void> {
    while (this.batches.length + this.failures.length < count) {
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }
}

/** A store over `files` with an open watch. */
async function watched(files: Record<string, string>) {
  const shell = new FakeFileShell({ opened: [acme], files });
  const store = new TauriDefinitionStore(shell, acme);
  const heard = new Heard();
  const watch: DefinitionWatch = await store.watch(heard);
  return { shell, store, heard, watch };
}

verifies("fs-tauri.write-if-unchanged-and-watch", () => {
  describe("TauriDefinitionStore watch", () => {
    it("reports files whose text changed outside, sorted, each once", async () => {
      const { shell, heard } = await watched({ "a.yaml": "1", "b.yaml": "1" });
      shell.changeOutside({ "b.yaml": null, "a.yaml": "2", "c.yaml": "new" });
      shell.send({ type: "changed", paths: ["a.yaml", "a.yaml"] });
      await heard.until(1);
      expect(heard.batches).toEqual([
        [
          { path: "a.yaml", kind: "changed" },
          { path: "b.yaml", kind: "removed" },
          { path: "c.yaml", kind: "changed" },
        ],
      ]);
    });

    it("leaves out its own writes and removes, files saved with the same text and private paths", async () => {
      const { shell, store, heard } = await watched({
        "a.yaml": "1",
        "b.yaml": "1",
        "d.yaml": "1",
      });
      await store.write("a.yaml", "2");
      await store.remove("b.yaml");
      // Refused as changed on disk: the file stays as it was, which is no change either.
      await store.write("d.yaml", "2", { expected: "absent" });
      shell.send({ type: "changed", paths: ["a.yaml", "b.yaml", "d.yaml"] });
      shell.changeOutside({
        ".git/index": "x",
        "../outside.yaml": "x",
        "d.yaml": "1",
        "c.yaml": "new",
      });
      await heard.until(1);
      expect(heard.batches).toEqual([[{ path: "c.yaml", kind: "changed" }]]);
    });

    it("still reports an outside change that made its own write come back changed on disk", async () => {
      const { shell, store, heard } = await watched({ "a.yaml": "1" });
      // Another editor saves before the shell's next batch says so.
      shell.files.set("a.yaml", "3");
      await store.write("a.yaml", "2", { expected: await contentDigest("1", sha256) });
      shell.send({ type: "changed", paths: ["a.yaml"] });
      await heard.until(1);
      expect(heard.batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("reports a file that became a link as removed", async () => {
      const { shell, heard } = await watched({ "hubs/a/hub.yaml": "id: a\n" });
      shell.links.add("hubs");
      shell.send({ type: "changed", paths: ["hubs/a/hub.yaml"] });
      await heard.until(1);
      expect(heard.batches).toEqual([[{ path: "hubs/a/hub.yaml", kind: "removed" }]]);
    });

    it("stops the shell's watch on close and reports nothing more", async () => {
      const { shell, heard, watch } = await watched({ "a.yaml": "1" });
      expect(shell.openWatches).toBe(1);
      await watch.close();
      await watch.close();
      expect(shell.openWatches).toBe(0);
      shell.files.set("a.yaml", "2");
      expect(heard.batches).toEqual([]);
      expect(shell.calls.at(-1)).toEqual({ command: "fs_unwatch", args: { watchId: 0 } });
    });

    it("closes even when the shell can't stop its watch", async () => {
      const { shell, watch } = await watched({});
      shell.refuseNext("io", "fs_unwatch");
      await expect(watch.close()).resolves.toBeUndefined();
    });

    it("tells the listener once when the shell's watch stops, and reports nothing more", async () => {
      const { shell, store, heard } = await watched({ "a.yaml": "1" });
      shell.send({ type: "failed", message: "the folder went away" });
      shell.changeOutside({ "a.yaml": "2" });
      await heard.until(1);
      await store.write("a.yaml", "3");
      expect(heard.batches).toEqual([]);
      expect(heard.failures.map((error) => error.message)).toEqual([
        "The workspace watch stopped: the folder went away",
      ]);
      expect(errorKindOf(heard.failures[0])).toBe("unavailable");
      expect(shell.openWatches).toBe(0);
    });

    it("fails on a message that isn't the shell's", async () => {
      for (const message of [null, { type: "changed", paths: [1] }, { type: "failed" }]) {
        const { shell, heard } = await watched({});
        shell.send(message);
        await heard.until(1);
        expect(errorKindOf(heard.failures[0]), JSON.stringify(message)).toBe("unavailable");
      }
    });

    it("fails with an Error when the files throw something else", async () => {
      const heard = new Heard();
      let deliver: (message: unknown) => void = () => {};
      await ShellWatch.open(
        {
          files: {
            location: acme,
            list: async () => [],
            read: async () => {
              throw "broken";
            },
            version: async () => "v",
          },
          digest: { sha256: async () => new Uint8Array(32) },
          openWatches: new Set(),
          events: {
            openChannel: (onMessage) => {
              deliver = onMessage;
              return { argument: "__CHANNEL__:0", close: () => {} };
            },
            start: async () => 0,
            stop: async () => {},
          },
        },
        heard,
      );
      deliver({ type: "changed", paths: ["a.yaml"] });
      await heard.until(1);
      expect(heard.failures[0]).toEqual(new Error("broken"));
    });

    it("fails when a changed file can't be read, but only once", async () => {
      const { shell, heard, watch } = await watched({ "a.yaml": "1" });
      shell.refuseNext("io", "fs_read");
      shell.send({ type: "changed", paths: ["a.yaml"] });
      shell.send({ type: "failed", message: "the folder went away" });
      await heard.until(1);
      // Waits for the batch being read, whose failure comes after the watch stopped.
      await watch.close();
      expect(heard.failures).toHaveLength(1);
    });

    it("fails, not the write, when its own change can't be read back", async () => {
      const { shell, store, heard } = await watched({ "a.yaml": "1" });
      shell.refuseNext("io", "fs_read");
      await expect(store.write("a.yaml", "2")).resolves.toEqual({ status: "written" });
      await heard.until(1);
      expect(errorKindOf(heard.failures[0])).toBe("unavailable");
      expect(shell.files.get("a.yaml")).toBe("2");
    });

    it("doesn't open when the shell refuses to watch, and stops listening", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      shell.refuseNext("folder_not_open", "fs_watch");
      const store = new TauriDefinitionStore(shell, acme);
      expect(errorKindOf(await store.watch(new Heard()).catch((error) => error))).toBe("denied");
      expect(shell.openWatches).toBe(0);
    });

    it("stops the shell's watch when the first listing fails", async () => {
      const shell = new FakeFileShell({ opened: [acme] });
      shell.refuseNext("io", "fs_list");
      const store = new TauriDefinitionStore(shell, acme);
      expect(errorKindOf(await store.watch(new Heard()).catch((error) => error))).toBe(
        "unavailable",
      );
      expect(shell.openWatches).toBe(0);
    });

    it("isn't told about the store's writes once the shell stopped it during the first listing", async () => {
      const shell = new FakeFileShell({ opened: [acme], files: { "a.yaml": "1" } });
      const invoke = shell.invoke.bind(shell);
      shell.invoke = async (command, args) => {
        if (command === "fs_list") {
          shell.send({ type: "failed", message: "the folder went away" });
        }
        return await invoke(command, args);
      };
      const store = new TauriDefinitionStore(shell, acme);
      const heard = new Heard();
      await store.watch(heard);
      await store.write("a.yaml", "2");
      expect(heard.failures).toHaveLength(1);
      // Only the write itself: no read back for a watch that already stopped.
      expect(shell.calls.slice(-1).map((call) => call.command)).toEqual(["fs_write"]);
    });
  });
});
