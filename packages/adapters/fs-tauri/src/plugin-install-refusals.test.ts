import { type ErrorKind, errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakePluginInstallShell } from "./fake-plugin-install-shell.test-helper.ts";
import {
  type PluginInstallRefusalKind,
  pluginInstallRefusalKinds,
} from "./plugin-install-commands.ts";
import { isSourceNotPicked, pluginInstallFailure } from "./plugin-install-failure.ts";
import { TauriPluginInstallSource } from "./plugin-install-source.ts";

/** How each refusal of the shell reaches the page: a RangeError, or an error kind. */
const expected: Record<PluginInstallRefusalKind, "range" | ErrorKind> = {
  source_not_picked: "denied",
  source_not_allowed: "denied",
  unsafe_path: "range",
  private_path: "range",
  special_path: "range",
  folder_unreadable: "unavailable",
  not_text: "invalid_input",
  too_big: "invalid_input",
  too_many_files: "invalid_input",
  io: "unavailable",
  address_not_allowed: "invalid_input",
  reference_not_allowed: "invalid_input",
  export_too_large: "invalid_input",
  cancelled: "conflict",
  export_failed: "unavailable",
  timed_out: "unavailable",
  output_too_large: "unavailable",
  git_not_found: "unavailable",
  git_too_old: "unavailable",
  hardening_ignored: "unavailable",
  export_token_invalid: "unavailable",
  export_busy: "limit_reached",
  hooks_folder_not_empty: "unavailable",
  hooks_folder_unreadable: "unavailable",
};

async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

/** A shell that answers every call with `answer`. */
const answering = (answer: unknown) => ({ invoke: async () => answer });

verifies("fs-tauri.plugin-install", () => {
  describe("every refusal of the shell", () => {
    it("reaches the page as the error the adapter promises", () => {
      expect(Object.keys(expected).sort()).toEqual([...pluginInstallRefusalKinds].sort());
      for (const kind of pluginInstallRefusalKinds) {
        const error = pluginInstallFailure({ kind, message: `the shell said ${kind}` });
        if (expected[kind] === "range") expect(error).toBeInstanceOf(RangeError);
        else expect(errorKindOf(error)).toBe(expected[kind]);
        expect(isSourceNotPicked(error)).toBe(kind === "source_not_picked");
      }
      expect(isSourceNotPicked(new Error("source_not_picked"))).toBe(false);
    });

    it("keeps the shell's own sentence for what a person can fix, and adds a line for the rest", () => {
      expect(pluginInstallFailure({ kind: "too_big", message: "It is large." }).message).toBe(
        "It is large.",
      );
      expect(pluginInstallFailure({ kind: "io", message: "disk said no" }).message).toContain(
        "disk said no",
      );
    });
  });

  describe("an answer in the wrong shape", () => {
    it("is unavailable for the picker", async () => {
      const source = new TauriPluginInstallSource(answering(5));
      expect(errorKindOf(await rejection(source.pick()))).toBe("unavailable");
    });

    it("is unavailable for an export", async () => {
      for (const answer of [
        null,
        "text",
        { location: "export:1", commit: 7, branch: null },
        { location: "export:1", commit: "a".repeat(40), branch: 4 },
        { location: "export:1", commit: "a".repeat(40) },
      ]) {
        const source = new TauriPluginInstallSource(answering(answer));
        const error = await rejection(
          source.exportGit(
            "https://example.com/acme/weather",
            undefined,
            new AbortController().signal,
          ),
        );
        expect(errorKindOf(error)).toBe("unavailable");
      }
    });
  });

  describe("the fake shell", () => {
    it("refuses a command it doesn't know, so the adapter's names are tested against it", async () => {
      const shell = new FakePluginInstallShell();
      expect(await rejection(shell.invoke("plugin_nope"))).toContain("not found");
    });
  });
});
