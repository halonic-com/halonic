import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakePluginInstallShell } from "./fake-plugin-install-shell.test-helper.ts";
import { TauriPluginFolderWriter } from "./plugin-folder-writer.ts";
import { isSourceNotPicked } from "./plugin-install-failure.ts";
import { TauriPluginInstallSource } from "./plugin-install-source.ts";
import { TauriPluginSourceReader } from "./plugin-source-reader.ts";

const acmeFolder = {
  files: { "plugin.yaml": "id: acme-weather\n", "src/index.js": "export {};\n" },
};
const acmeAddress = "https://example.com/acme/weather";
const acmeCommit = "a".repeat(40);
const acmeRepository = { tree: acmeFolder, commit: acmeCommit, branch: "main" };

async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

const files = new Map([
  ["plugin.yaml", new TextEncoder().encode("id: acme-weather\n")],
  ["src/index.js", new TextEncoder().encode("export {};\n")],
]);

/** A token source that counts, so a test knows the token an export used. */
function tokens(): () => string {
  let next = 0;
  return () => `token-${++next}`;
}

verifies("fs-tauri.plugin-install", () => {
  describe("TauriPluginFolderWriter.place", () => {
    it("places a plugin by its name with its files as base64url, and answers placed", async () => {
      const shell = new FakePluginInstallShell();
      const placement = await new TauriPluginFolderWriter(shell).place("acme-weather", files, {
        replace: false,
      });
      expect(placement).toBe("placed");
      expect(shell.calls).toEqual([
        {
          command: "plugin_folder_place",
          args: {
            plugin: "acme-weather",
            files: [
              { path: "plugin.yaml", bytes: "aWQ6IGFjbWUtd2VhdGhlcgo" },
              { path: "src/index.js", bytes: "ZXhwb3J0IHt9Owo" },
            ],
            replace: false,
          },
        },
      ]);
      expect(shell.placed.get("acme-weather")?.get("src/index.js")).toBe("export {};\n");
    });

    it("answers taken for a name in use in another case, and replaces only on request", async () => {
      const shell = new FakePluginInstallShell({ installed: ["Acme-Weather", "acme-clock"] });
      const writer = new TauriPluginFolderWriter(shell);
      expect(await writer.place("acme-weather", files, { replace: false })).toBe("taken");
      expect(await writer.place("acme-weather", files, { replace: true })).toBe("taken");
      expect(await writer.place("acme-clock", files, { replace: true })).toBe("placed");
      expect(await writer.place("acme-clock", files, { replace: false })).toBe("taken");
    });

    it("refuses an unsafe name or path with a RangeError before it calls the shell", async () => {
      const shell = new FakePluginInstallShell();
      const writer = new TauriPluginFolderWriter(shell);
      expect(await rejection(writer.place("..", files, { replace: false }))).toBeInstanceOf(
        RangeError,
      );
      const outside = new Map([["../outside", new Uint8Array()]]);
      expect(await rejection(writer.place("acme", outside, { replace: false }))).toBeInstanceOf(
        RangeError,
      );
      const sameInOtherCase = new Map([
        ["Plugin.yaml", new Uint8Array()],
        ["plugin.yaml", new Uint8Array()],
      ]);
      expect(
        await rejection(writer.place("acme", sameInOtherCase, { replace: false })),
      ).toBeInstanceOf(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("rejects with unavailable, without the shell's text, for a page without the capability", async () => {
      const shell = new FakePluginInstallShell({ granted: false });
      const error = await rejection(
        new TauriPluginFolderWriter(shell).place("acme", files, { replace: false }),
      );
      expect(errorKindOf(error)).toBe("unavailable");
      expect(String(error)).not.toContain("ACL");
    });

    it("rejects with unavailable for an answer that is neither placed nor taken", async () => {
      const shell = { invoke: async () => "maybe" };
      const error = await rejection(
        new TauriPluginFolderWriter(shell).place("acme", files, { replace: false }),
      );
      expect(errorKindOf(error)).toBe("unavailable");
    });

    it("maps the shell's refusals: a name it refuses is a RangeError, a plugin too large is invalid input", async () => {
      const refusing = (kind: string) => ({
        invoke: () => Promise.reject({ kind, message: `refused with ${kind}` }),
      });
      const place = (shell: { invoke: () => Promise<never> }) =>
        new TauriPluginFolderWriter(shell).place("acme", files, { replace: false });
      expect(await rejection(place(refusing("unsafe_path")))).toBeInstanceOf(RangeError);
      expect(errorKindOf(await rejection(place(refusing("too_big"))))).toBe("invalid_input");
      expect(errorKindOf(await rejection(place(refusing("too_many_files"))))).toBe("invalid_input");
      expect(errorKindOf(await rejection(place(refusing("io"))))).toBe("unavailable");
    });
  });

  describe("TauriPluginInstallSource", () => {
    it("answers the picked folder's location, or undefined when the person picks nothing", async () => {
      const shell = new FakePluginInstallShell({
        sources: { "pick:acme": acmeFolder },
        picks: ["pick:acme", null],
      });
      const source = new TauriPluginInstallSource(shell);
      expect(await source.pick()).toBe("pick:acme");
      expect(await source.pick()).toBeUndefined();
      expect(shell.calls.map((call) => call.args)).toEqual([{}, {}]);
    });

    it("reads a picked folder through its location and names no path of its own", async () => {
      const shell = new FakePluginInstallShell({ sources: { "pick:acme": acmeFolder } });
      const reader = new TauriPluginInstallSource(shell).reader("pick:acme");
      expect((await reader.entries()).map((entry) => entry.path)).toEqual([
        "plugin.yaml",
        "src",
        "src/index.js",
      ]);
      expect(new TextDecoder().decode((await reader.read("plugin.yaml")) ?? undefined)).toBe(
        "id: acme-weather\n",
      );
      expect(await reader.read("missing.txt")).toBeNull();
      for (const call of shell.calls) expect(call.args?.["source"]).toBe("pick:acme");
      expect(shell.calls.map((call) => call.command)).toEqual([
        "plugin_source_entries",
        "plugin_source_read",
        "plugin_source_read",
      ]);
    });

    it("gives the picked location as the folder's, and an entry's only when it is there", async () => {
      const shell = new FakePluginInstallShell({ sources: { "pick:acme": acmeFolder } });
      const reader = new TauriPluginInstallSource(shell).reader("pick:acme");
      expect(await reader.locationOf()).toBe("pick:acme");
      expect(await reader.locationOf("src/index.js")).toBe("pick:acme/src/index.js");
      expect(await reader.locationOf("plugin.yaml")).toBe("pick:acme/plugin.yaml");
      expect(await reader.locationOf("src/missing.js")).toBeNull();
      expect(await reader.locationOf("missing/index.js")).toBeNull();
      await expect(reader.locationOf("../secrets")).rejects.toThrow(RangeError);
      for (const call of shell.calls) expect(call.args?.["source"]).toBe("pick:acme");
    });

    it("refuses a location the person never picked with the shell's own sentence", async () => {
      const shell = new FakePluginInstallShell({ sources: { "pick:acme": acmeFolder } });
      const reader = new TauriPluginSourceReader(shell, "/somewhere/typed/secrets");
      const error = await rejection(reader.entries());
      expect(errorKindOf(error)).toBe("denied");
      expect(isSourceNotPicked(error)).toBe(true);
      expect((error as Error).message).toBe(
        "A plugin can only be added from a folder chosen with Choose folder.",
      );
    });

    it("refuses an unsafe path with a RangeError before it calls the shell", async () => {
      const shell = new FakePluginInstallShell({ sources: { "pick:acme": acmeFolder } });
      const reader = new TauriPluginSourceReader(shell, "pick:acme");
      expect(await rejection(reader.read("../profile/secret"))).toBeInstanceOf(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("exports a git address and reads the commit, then removes it when ended", async () => {
      const shell = new FakePluginInstallShell({ repositories: { [acmeAddress]: acmeRepository } });
      const source = new TauriPluginInstallSource(shell, tokens());
      const exported = await source.exportGit(acmeAddress, "v1", new AbortController().signal);
      expect(exported.commit).toBe(acmeCommit);
      expect(exported.branch).toBe("main");
      expect(shell.kept).toEqual(["export:token-1"]);
      expect(
        new TextDecoder().decode((await exported.reader.read("src/index.js")) ?? undefined),
      ).toBe("export {};\n");
      expect(shell.calls[0]).toEqual({
        command: "plugin_git_export",
        args: { address: acmeAddress, reference: "v1", token: "token-1" },
      });
      await exported.end();
      await exported.end();
      expect(shell.ended).toEqual(["token-1"]);
      expect(shell.kept).toEqual([]);
    });

    it("sends no reference for the remote's default branch", async () => {
      const shell = new FakePluginInstallShell({ repositories: { [acmeAddress]: acmeRepository } });
      const source = new TauriPluginInstallSource(shell, tokens());
      await source.exportGit(acmeAddress, undefined, new AbortController().signal);
      expect(shell.calls[0]?.args?.["reference"]).toBeNull();
    });

    it("ends an export that is still running when the signal aborts, and rejects with conflict", async () => {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const shell = new FakePluginInstallShell({
        repositories: { [acmeAddress]: acmeRepository },
        hold: () => held,
      });
      const controller = new AbortController();
      const exporting = new TauriPluginInstallSource(shell, tokens()).exportGit(
        acmeAddress,
        undefined,
        controller.signal,
      );
      const outcome = rejection(exporting);
      controller.abort();
      release();
      expect(errorKindOf(await outcome)).toBe("conflict");
      expect(shell.ended).toContain("token-1");
      expect(shell.kept).toEqual([]);
    });

    it("removes an export that finished after the signal aborted", async () => {
      const controller = new AbortController();
      const shell = new FakePluginInstallShell({
        repositories: { [acmeAddress]: acmeRepository },
        hold: async () => controller.abort(),
        loseEndsWhileHeld: true,
      });
      const source = new TauriPluginInstallSource(shell, tokens());
      const outcome = await rejection(source.exportGit(acmeAddress, undefined, controller.signal));
      expect(errorKindOf(outcome)).toBe("conflict");
      expect(shell.kept).toEqual([]);
    });

    it("does not start when the signal has already aborted", async () => {
      const shell = new FakePluginInstallShell({ repositories: { [acmeAddress]: acmeRepository } });
      const controller = new AbortController();
      controller.abort();
      await rejection(
        new TauriPluginInstallSource(shell).exportGit(acmeAddress, undefined, controller.signal),
      );
      expect(shell.calls).toEqual([]);
    });

    it("rejects with the shell's own sentence for an address it refuses", async () => {
      const shell = {
        invoke: () =>
          Promise.reject({
            kind: "address_not_allowed",
            message: "can't use that git address: only https:// and ssh:// addresses are allowed",
          }),
      };
      const error = await rejection(
        new TauriPluginInstallSource(shell).exportGit(
          "ext::sh -c x",
          undefined,
          new AbortController().signal,
        ),
      );
      expect(errorKindOf(error)).toBe("invalid_input");
      expect((error as Error).message).toContain("only https:// and ssh://");
    });

    it("rejects with unavailable when git can't reach the repository", async () => {
      const shell = new FakePluginInstallShell();
      const error = await rejection(
        new TauriPluginInstallSource(shell).exportGit(
          "https://example.invalid/none",
          undefined,
          new AbortController().signal,
        ),
      );
      expect(errorKindOf(error)).toBe("unavailable");
    });

    it("rejects with unavailable, without the shell's text, for a page without the capability", async () => {
      const shell = new FakePluginInstallShell({ granted: false });
      const source = new TauriPluginInstallSource(shell);
      for (const action of [
        source.pick(),
        source.exportGit(acmeAddress, undefined, new AbortController().signal),
      ]) {
        const error = await rejection(action);
        expect(errorKindOf(error)).toBe("unavailable");
        expect(String(error)).not.toContain("ACL");
      }
    });

    it("rejects with unavailable for an export answer in the wrong shape, and ends it", async () => {
      const calls: string[] = [];
      const shell = {
        invoke: async (command: string) => {
          calls.push(command);
          return command === "plugin_git_export" ? { location: 3 } : null;
        },
      };
      const error = await rejection(
        new TauriPluginInstallSource(shell).exportGit(
          acmeAddress,
          undefined,
          new AbortController().signal,
        ),
      );
      expect(errorKindOf(error)).toBe("unavailable");
      expect(calls).toEqual(["plugin_git_export", "plugin_git_export_end"]);
    });
  });
});
