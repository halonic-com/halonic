import { errorKindOf } from "@halonicjs/std";
import { trustRecord, trustStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeTrustShell } from "./fake-shell.test-helper.ts";
import { isTrustRefusal, type TrustRefusalKind } from "./shell.ts";
import { TauriTrustStore } from "./trust-store.ts";

trustStoreContract("tauri", async () => {
  const shell = new FakeTrustShell();
  return { store: new TauriTrustStore(shell), damage: async (location) => shell.damage(location) };
});

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.trust-commands", () => {
  describe("TauriTrustStore", () => {
    it("sends each call to its trust_* command with the record or location as given", async () => {
      const shell = new FakeTrustShell();
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/workspaces/acme"));
      await store.get("/Workspaces/acme");
      await store.list();
      await store.revoke("/workspaces/acme/");
      expect(shell.calls).toEqual([
        { command: "trust_grant", args: { record: trustRecord("/workspaces/acme") } },
        { command: "trust_get", args: { location: "/Workspaces/acme" } },
        { command: "trust_list", args: {} },
        { command: "trust_revoke", args: { location: "/workspaces/acme/" } },
      ]);
    });

    it("grants a folder inside one the person picked without asking, and opens it", async () => {
      const shell = new FakeTrustShell({ picked: ["/workspaces/acme"] });
      await new TauriTrustStore(shell).grant(trustRecord("/workspaces/acme/hubs/shared"));
      expect(shell.asked).toEqual([]);
      expect(shell.opened).toEqual(["/workspaces/acme", "/workspaces/acme/hubs/shared"]);
    });

    it("asks again for a folder inside one a grant opened, since only picked folders spare a question", async () => {
      const shell = new FakeTrustShell({ picked: ["/workspaces/acme"] });
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/hubs/shared"));
      await store.grant(trustRecord("/hubs/shared/skills"));
      await store.grant(trustRecord("/workspaces/acme-evil"));
      expect(shell.asked).toEqual(["/hubs/shared", "/hubs/shared/skills", "/workspaces/acme-evil"]);
    });

    it("asks about a folder that only looks inside a picked one until `..` is resolved", async () => {
      const shell = new FakeTrustShell({ picked: ["/workspaces/acme"] });
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/workspaces/acme/../other"));
      await store.grant(trustRecord("/workspaces/acme/./hubs/../skills"));
      expect(shell.asked).toEqual(["/workspaces/acme/../other"]);
    });

    it("closes the folder when its trust is revoked", async () => {
      const shell = new FakeTrustShell();
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/hubs/shared"));
      expect(shell.opened).toEqual(["/hubs/shared"]);
      await store.revoke("/hubs/shared");
      expect(shell.opened).toEqual([]);
    });

    it("keeps a picked folder open when its trust is revoked, and asks again on the next grant", async () => {
      const shell = new FakeTrustShell({ picked: ["/workspaces/acme"] });
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/workspaces/acme"));
      expect(shell.asked).toEqual([]);
      await store.revoke("/workspaces/acme");
      expect(await store.get("/workspaces/acme")).toBeNull();
      expect(shell.opened).toEqual(["/workspaces/acme"]);
      await store.grant(trustRecord("/workspaces/acme"));
      expect(shell.asked).toEqual(["/workspaces/acme"]);
      await store.revoke("/workspaces/acme");
      expect(shell.opened).toEqual(["/workspaces/acme"]);
    });

    it("rejects a grant the person says no to as denied, and saves and opens nothing", async () => {
      const shell = new FakeTrustShell();
      shell.answers.push(false);
      const store = new TauriTrustStore(shell);

      const error = await rejection(store.grant(trustRecord("/workspaces/acme")));
      expect(errorKindOf(error)).toBe("denied");
      expect(shell.asked).toEqual(["/workspaces/acme"]);
      expect(shell.opened).toEqual([]);
      expect(await store.get("/workspaces/acme")).toBeNull();
    });

    it("names the location of a record the shell can't read, even when only the call knows it", async () => {
      const shell = new FakeTrustShell();
      const store = new TauriTrustStore(shell);
      shell.refuseNext("unreadable");
      await expect(store.get("/workspaces/acme")).rejects.toThrow('"/workspaces/acme"');
      shell.refuseNext("unreadable");
      await expect(store.list()).rejects.toThrow("can't be read, nor which location it is for");
    });

    it("gives each other refusal its error kind", async () => {
      const expected: Record<Exclude<TrustRefusalKind, "unreadable">, string> = {
        declined: "denied",
        busy: "conflict",
        folder_unreadable: "not_found",
        invalid_record: "internal",
        io: "unavailable",
        profile_setting: "unavailable",
        not_picked: "denied",
        folder_missing: "not_found",
        folder_changed: "denied",
        name_invalid: "invalid_input",
        parent_not_chosen: "denied",
        parent_private: "denied",
        exists: "conflict",
        profile_inside: "denied",
        workspace_inside_profile: "denied",
      };
      for (const [refusal, kind] of Object.entries(expected)) {
        const shell = new FakeTrustShell();
        shell.refuseNext(refusal as TrustRefusalKind);
        const error = await rejection(new TauriTrustStore(shell).grant(trustRecord("/a")));
        expect(errorKindOf(error), refusal).toBe(kind);
      }
    });

    it("rejects as internal, without the shell's text, when the page has no trust capability (C613 12)", async () => {
      const store = new TauriTrustStore(new FakeTrustShell({ granted: false }));
      for (const call of [
        store.get("/a"),
        store.list(),
        store.grant(trustRecord("/a")),
        store.revoke("/a"),
      ]) {
        const error = await rejection(call);
        expect(errorKindOf(error)).toBe("internal");
        expect(String(error)).not.toContain("ACL");
      }
    });

    it("says an io refusal in Halonic's words, with the shell's message only in the details (C548 5)", async () => {
      const message = "Permission denied (os error 13)";
      const store = new TauriTrustStore({
        invoke: async () => Promise.reject({ kind: "io", message }),
      });
      const revoked = await rejection(store.revoke("/a"));
      expect(errorKindOf(revoked)).toBe("unavailable");
      expect(revoked).toMatchObject({
        message: "Halonic can't write to its data folder.",
        details: message,
      });
      expect(await rejection(store.list())).toMatchObject({
        message: "Halonic can't read its data folder.",
        details: message,
      });
    });

    it("makes a relative HALONIC_HOME's sentence and fix the main text, and keeps it in the details (HAL-15963)", async () => {
      const message =
        'HALONIC_HOME must be a full path, not "~/.halonic". Use $HOME instead: HALONIC_HOME="$HOME/.halonic".';
      const store = new TauriTrustStore({
        invoke: async () => Promise.reject({ kind: "profile_setting", message }),
      });
      for (const call of [store.revoke("/a"), store.list()]) {
        const error = await rejection(call);
        expect(errorKindOf(error)).toBe("unavailable");
        expect(error).toMatchObject({ message, details: message });
      }
    });

    it("keeps the text of a call the shell didn't answer only in the details (C548 5)", async () => {
      const store = new TauriTrustStore(new FakeTrustShell({ granted: false }));
      const error = await rejection(store.revoke("/a"));
      expect(error).toMatchObject({
        message: "Halonic ran into a problem it can't explain yet.",
      });
      expect((error as { details: string }).details).toMatch(
        /^The desktop shell gave no answer to the trust call\.\n.*ACL/su,
      );
    });

    it("puts any other rejection's text in the details, even one JSON can't write", async () => {
      const circular: { self?: unknown } = {};
      circular.self = circular;
      const rejections: [unknown, string][] = [
        ["no IPC", "no IPC"],
        [new TypeError("bad call"), "TypeError: bad call"],
        [{ code: 7 }, '{"code":7}'],
        [Symbol("gone"), "Symbol(gone)"],
        [circular, "[object Object]"],
      ];
      for (const [reason, text] of rejections) {
        const store = new TauriTrustStore({ invoke: async () => Promise.reject(reason) });
        const error = await rejection(store.revoke("/a"));
        expect(error).toMatchObject({
          message: "Halonic ran into a problem it can't explain yet.",
        });
        expect((error as { details: string }).details).toBe(
          `The desktop shell gave no answer to the trust call.\n${text}`,
        );
      }
    });

    it("rejects an answer that isn't a record as internal", async () => {
      const answers: unknown[] = [{ location: 7 }, "record", { list: [] }];
      for (const answer of answers) {
        const store = new TauriTrustStore({ invoke: async () => answer });
        expect(errorKindOf(await rejection(store.get("/a")))).toBe("internal");
        expect(errorKindOf(await rejection(store.list()))).toBe("internal");
      }
    });
  });

  describe("isTrustRefusal", () => {
    it("takes only the shell's refusal shape", () => {
      expect(isTrustRefusal({ kind: "unreadable", message: "m", location: "/a", file: "f" })).toBe(
        true,
      );
      expect(isTrustRefusal({ kind: "denied", message: "m" })).toBe(false);
      expect(isTrustRefusal({ kind: "io", message: 1 })).toBe(false);
      expect(isTrustRefusal({ kind: "name_invalid", message: "m", reason: "empty" })).toBe(true);
      expect(isTrustRefusal({ kind: "name_invalid", message: "m", reason: 2 })).toBe(false);
      expect(isTrustRefusal({ kind: "unreadable", message: "m", location: null })).toBe(false);
      expect(isTrustRefusal({ kind: "unreadable", message: "m", file: 2 })).toBe(false);
      expect(isTrustRefusal("Command trust_get not allowed by ACL")).toBe(false);
      expect(isTrustRefusal(null)).toBe(false);
    });

    it("asks whether trusted folders are still there, and leaves out a location with no record", async () => {
      const shell = new FakeTrustShell();
      const store = new TauriTrustStore(shell);
      await store.grant(trustRecord("/workspaces/acme"));
      await store.grant(trustRecord("/workspaces/gone"));
      shell.removeFolder("/workspaces/gone");
      const found = await store.foldersFound([
        "/workspaces/acme",
        "/workspaces/gone",
        "/workspaces/never",
      ]);
      expect([...found]).toEqual([
        ["/workspaces/acme", true],
        ["/workspaces/gone", false],
      ]);
      expect(await store.foldersFound([])).toEqual(new Map());
    });

    it("gives an internal error for a folders-found answer it can't use", async () => {
      for (const answer of [["/a"], null, { "/a": "yes" }]) {
        const store = new TauriTrustStore({ invoke: async () => answer });
        expect(errorKindOf(await rejection(store.foldersFound(["/a"])))).toBe("internal");
      }
    });
  });
});

describe("the fake shell", () => {
  it("refuses a command the shell doesn't have, and damage without a record", async () => {
    const shell = new FakeTrustShell();
    await expect(shell.invoke("trust_open", { location: "/a" })).rejects.toBe(
      "Command trust_open not found",
    );
    expect(() => shell.damage("/a")).toThrow("no record for /a");
  });
});
