import type { TauriShell } from "@halonicjs/adapter-fs-tauri";
import type { PluginAddRefusal, PluginService } from "@halonicjs/app";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { desktopPluginInstaller } from "./desktop-plugin-installer.ts";

const acmeAddress = "https://example.com/acme/weather";
const acmeCommit = "a".repeat(40);

/** The shell's refusal shape, as the Rust commands reject. */
function refusal(kind: string, message: string): unknown {
  return { kind, message };
}

/** A shell that exports `acmeAddress`, or fails the way `failure` says, and keeps every call. */
function fakeShell(options: { failure?: unknown; picks?: (string | null)[] } = {}) {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const picks = [...(options.picks ?? [])];
  const shell: TauriShell = {
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === "plugin_source_pick") return picks.shift() ?? null;
      if (command === "plugin_git_export") {
        if (options.failure !== undefined) throw options.failure;
        return { location: "export:one", commit: acmeCommit, branch: "main" };
      }
      return null;
    },
  };
  return { shell, calls };
}

type Added = Awaited<ReturnType<PluginService["add"]>>;
type AddCall = { reader: unknown; options: { from: unknown; replace: boolean } };

/** A service that answers `answer` to every add, and keeps what it was given. */
function fakeService(answer: Added | (() => Promise<Added>)) {
  const added: AddCall[] = [];
  const service = {
    async add(reader: unknown, options: AddCall["options"]) {
      added.push({ reader, options });
      return typeof answer === "function" ? await answer() : answer;
    },
  };
  return { service, added };
}

const addedPlugin = { ok: true, value: { folder: "acme-weather" } } as unknown as Added;

function refused(error: PluginAddRefusal): Added {
  return { ok: false, error } as Added;
}

function installerOver(
  shell: TauriShell,
  service: ReturnType<typeof fakeService>["service"],
  reloads: { count: number; failures: unknown[]; fail?: boolean } = { count: 0, failures: [] },
) {
  return desktopPluginInstaller({
    ipc: shell,
    service,
    reload: async () => {
      reloads.count += 1;
      if (reloads.fail === true) throw new Error("the folder can't be listed");
    },
    onReloadFailed: (error) => reloads.failures.push(error),
  });
}

const never = new AbortController().signal;

verifies("studio.desktop-plugin-installer", () => {
  describe("from a picked folder", () => {
    it("offers Choose folder through the shell's picker, and nothing when the person cancels", async () => {
      const { shell, calls } = fakeShell({ picks: ["pick:acme", null] });
      const installer = installerOver(shell, fakeService(addedPlugin).service);
      expect(await installer.chooseFolder?.()).toBe("pick:acme");
      expect(await installer.chooseFolder?.()).toBeUndefined();
      expect(calls.map((call) => call.command)).toEqual([
        "plugin_source_pick",
        "plugin_source_pick",
      ]);
    });

    it("adds the plugin not trusted from the picked location, and reads the plugins again", async () => {
      const { shell } = fakeShell();
      const { service, added } = fakeService(addedPlugin);
      const reloads = { count: 0, failures: [] };
      const outcome = await installerOver(shell, service, reloads).add(
        { kind: "folder", path: "pick:acme" },
        never,
      );
      expect(outcome).toEqual({ kind: "added", plugin: "acme-weather" });
      expect(added.map((call) => call.options)).toEqual([
        { from: { kind: "folder", path: "pick:acme" }, replace: false },
      ]);
      expect(reloads.count).toBe(1);
    });

    it("keeps the add when reading the plugins again fails, and says so separately", async () => {
      const { shell } = fakeShell();
      const reloads = { count: 0, failures: [] as unknown[], fail: true };
      const outcome = await installerOver(shell, fakeService(addedPlugin).service, reloads).add(
        { kind: "folder", path: "pick:acme" },
        never,
      );
      expect(outcome).toEqual({ kind: "added", plugin: "acme-weather" });
      expect(reloads.failures).toHaveLength(1);
    });

    it("adds nothing when the dialog closed before the add, and rejects with conflict", async () => {
      const controller = new AbortController();
      controller.abort();
      const { service, added } = fakeService(addedPlugin);
      const error = await installerOver(fakeShell().shell, service)
        .add({ kind: "folder", path: "pick:acme" }, controller.signal)
        .then(
          () => expect.unreachable("the add should have failed"),
          (reason: unknown) => reason,
        );
      expect(errorKindOf(error)).toBe("conflict");
      expect(added).toHaveLength(0);
    });

    it("says taken for a name in use", async () => {
      const outcome = await installerOver(
        fakeShell().shell,
        fakeService(refused({ kind: "taken", id: "Acme-Weather" })).service,
      ).add({ kind: "folder", path: "pick:acme" }, never);
      expect(outcome).toEqual({ kind: "taken", plugin: "Acme-Weather" });
    });

    it("says no-manifest for a folder without plugin.yaml, and broken with the problems otherwise", async () => {
      const problem = { file: "plugin.yaml", path: ["ui", "panel"], message: "no title" };
      const missing = { code: "manifest-missing", file: "", path: [], message: "no plugin.yaml" };
      const withProblems = fakeService(
        refused({ kind: "broken", problems: [{ code: "title", ...problem }] }),
      );
      const withoutManifest = fakeService(refused({ kind: "broken", problems: [missing] }));
      const ipc = fakeShell().shell;
      expect(
        await installerOver(ipc, withoutManifest.service).add(
          { kind: "folder", path: "pick:acme" },
          never,
        ),
      ).toEqual({ kind: "no-manifest" });
      expect(
        await installerOver(ipc, withProblems.service).add(
          { kind: "folder", path: "pick:acme" },
          never,
        ),
      ).toEqual({ kind: "broken", problems: [problem] });
    });

    it("lets the shell's sentence through for a path the person typed instead of picking", async () => {
      const sentence = "A plugin can only be added from a folder chosen with Choose folder.";
      const { service } = fakeService(async () => {
        throw Object.assign(new Error(sentence), { kind: "denied" });
      });
      const error = await installerOver(fakeShell().shell, service)
        .add({ kind: "folder", path: "/somewhere/typed" }, never)
        .then(
          () => expect.unreachable("the add should have failed"),
          (reason: unknown) => reason,
        );
      expect(errorKindOf(error)).toBe("denied");
      expect((error as Error).message).toBe(sentence);
    });
  });

  describe("from a git repository", () => {
    it("exports the commit, adds it with its address and full commit id, and ends the export", async () => {
      const { shell, calls } = fakeShell();
      const { service, added } = fakeService(addedPlugin);
      const outcome = await installerOver(shell, service).add(
        { kind: "git", address: acmeAddress, ref: "v1" },
        never,
      );
      expect(outcome).toEqual({ kind: "added", plugin: "acme-weather" });
      expect(added[0]?.options).toEqual({
        from: { kind: "git", address: acmeAddress, commit: acmeCommit },
        replace: false,
      });
      expect(calls.map((call) => call.command)).toEqual([
        "plugin_git_export",
        "plugin_git_export_end",
      ]);
      expect(calls[0]?.args).toMatchObject({ address: acmeAddress, reference: "v1" });
      expect(calls[1]?.args).toEqual({ token: calls[0]?.args?.["token"] });
    });

    it("ends the export when the add is refused or throws", async () => {
      for (const answer of [
        fakeService(refused({ kind: "taken", id: "acme-weather" })),
        fakeService(async () => {
          throw new Error("the folder can't be read");
        }),
      ]) {
        const { shell, calls } = fakeShell();
        await installerOver(shell, answer.service)
          .add({ kind: "git", address: acmeAddress }, never)
          .catch(() => undefined);
        expect(calls.map((call) => call.command).at(-1)).toBe("plugin_git_export_end");
      }
    });

    it("says offline with the host when git can't reach the repository", async () => {
      const { shell } = fakeShell({
        failure: refusal(
          "export_failed",
          "couldn't reach the repository: Could not resolve host: example.com",
        ),
      });
      const outcome = await installerOver(shell, fakeService(addedPlugin).service).add(
        { kind: "git", address: acmeAddress },
        never,
      );
      expect(outcome).toEqual({ kind: "offline", host: "example.com" });
    });

    it("lets any other failure through with the shell's sentence", async () => {
      const { shell } = fakeShell({
        failure: refusal(
          "address_not_allowed",
          "can't use that git address: only https:// and ssh:// addresses are allowed",
        ),
      });
      const error = await installerOver(shell, fakeService(addedPlugin).service)
        .add({ kind: "git", address: "ext::sh -c x" }, never)
        .then(
          () => expect.unreachable("the add should have failed"),
          (reason: unknown) => reason,
        );
      expect(errorKindOf(error)).toBe("invalid_input");
      expect((error as Error).message).toContain("only https:// and ssh://");
    });

    it("ends the export when the dialog closes while git runs", async () => {
      const controller = new AbortController();
      const { shell, calls } = fakeShell();
      const slow: TauriShell = {
        async invoke(command, args) {
          if (command === "plugin_git_export") {
            calls.push({ command, args });
            controller.abort();
            throw refusal("cancelled", "the export was stopped");
          }
          return await shell.invoke(command, args);
        },
      };
      const error = await installerOver(slow, fakeService(addedPlugin).service)
        .add({ kind: "git", address: acmeAddress }, controller.signal)
        .then(
          () => expect.unreachable("the add should have failed"),
          (reason: unknown) => reason,
        );
      expect(errorKindOf(error)).toBe("conflict");
      expect(calls.map((call) => call.command)).toContain("plugin_git_export_end");
    });
  });
});
