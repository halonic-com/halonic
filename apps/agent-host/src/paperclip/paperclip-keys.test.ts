import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { PaperclipKeys, type PaperclipKeyUse } from "./paperclip-keys.ts";

// A fake key only these tests use, so its absence from answers means something.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const acme = { address: "https://paperclip.acme.test", company: "acme-company" };
const halonic = { workspace: "/work/acme", connection: "halonic" };

/** A store holding the fake key for `halonic`, made for `acme`. */
function keysForAcme(): PaperclipKeys {
  const keys = new PaperclipKeys();
  keys.replace(halonic, { key: fakeKey, ...acme });
  return keys;
}

/** A request that records what it was given and answers `ok`. */
function recordingRequest() {
  return vi.fn(async (_use: PaperclipKeyUse) => ({ kind: "ok" as const }));
}

verifies("agent-host.paperclip-key-hand-over", () => {
  describe("the guard before every request", () => {
    it("sends a request with the key to the address the key was made for", async () => {
      const request = recordingRequest();
      expect(await keysForAcme().callWith(halonic, acme, request)).toEqual({ kind: "ok" });
      expect(request).toHaveBeenCalledWith({ key: fakeKey, origin: "https://paperclip.acme.test" });
    });

    it("makes no request and reports signed-out when the address changed to another server", async () => {
      const request = recordingRequest();
      const answer = await keysForAcme().callWith(
        halonic,
        { ...acme, address: "https://evil.test" },
        request,
      );
      expect(answer).toEqual({ kind: "failed", failure: "signed-out" });
      expect(request).not.toHaveBeenCalled();
    });

    it("makes no request when only the scheme or the port changed", async () => {
      const request = recordingRequest();
      const keys = keysForAcme();
      for (const address of ["http://paperclip.acme.test", "https://paperclip.acme.test:8443"]) {
        expect(await keys.callWith(halonic, { ...acme, address }, request)).toEqual({
          kind: "failed",
          failure: "signed-out",
        });
      }
      expect(request).not.toHaveBeenCalled();
    });

    it("makes no request and reports signed-out for another company", async () => {
      const request = recordingRequest();
      const answer = await keysForAcme().callWith(
        halonic,
        { ...acme, company: "other-company" },
        request,
      );
      expect(answer).toEqual({ kind: "failed", failure: "signed-out" });
      expect(request).not.toHaveBeenCalled();
    });

    it("reads the address as the browser does, so case, the default port and a slash don't count", async () => {
      const request = recordingRequest();
      const now = { ...acme, address: "https://PAPERCLIP.acme.test:443/" };
      expect(await keysForAcme().callWith(halonic, now, request)).toEqual({ kind: "ok" });
      expect(request).toHaveBeenCalledWith({ key: fakeKey, origin: "https://paperclip.acme.test" });
    });

    it("makes no request for a connection it holds no key for, or one it forgot", async () => {
      const request = recordingRequest();
      const keys = keysForAcme();
      expect(await keys.callWith({ ...halonic, connection: "acme" }, acme, request)).toEqual({
        kind: "failed",
        failure: "signed-out",
      });
      keys.forget(halonic);
      expect(keys.has(halonic)).toBe(false);
      expect(await keys.callWith(halonic, acme, request)).toEqual({
        kind: "failed",
        failure: "signed-out",
      });
      expect(request).not.toHaveBeenCalled();
    });

    it("makes no request when the file's address isn't a web address", async () => {
      const request = recordingRequest();
      const keys = keysForAcme();
      for (const address of ["not an address", "file:///etc/hosts"]) {
        expect(await keys.callWith(halonic, { ...acme, address }, request)).toMatchObject({
          failure: "signed-out",
        });
      }
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe("the store", () => {
    it("refuses plain http to another computer, and keeps it to this one", async () => {
      const keys = new PaperclipKeys();
      expect(() =>
        keys.replace(halonic, { key: fakeKey, ...acme, address: "http://paperclip.acme.test" }),
      ).toThrow(RangeError);
      expect(keys.has(halonic)).toBe(false);
      for (const address of [
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://[::1]:3100",
      ]) {
        keys.replace(halonic, { key: fakeKey, ...acme, address });
        expect(keys.madeFor(halonic)).toEqual({ address, company: acme.company });
      }
    });

    it("binds the key to its workspace, so another workspace's file of the same name gets no call", async () => {
      const request = recordingRequest();
      const other = { ...halonic, workspace: "/work/clone-of-acme" };
      expect(await keysForAcme().callWith(other, acme, request)).toEqual({
        kind: "failed",
        failure: "signed-out",
      });
      expect(request).not.toHaveBeenCalled();
    });

    it("refuses a key whose address isn't http or https, keeping the one held before", async () => {
      const keys = keysForAcme();
      expect(() =>
        keys.replace(halonic, { key: "other", address: "ftp://acme.test", company: "x" }),
      ).toThrow(RangeError);
      const request = recordingRequest();
      await keys.callWith(halonic, acme, request);
      expect(request).toHaveBeenCalledWith({ key: fakeKey, origin: "https://paperclip.acme.test" });
    });
  });

  describe("putting the earlier key back", () => {
    const keyB = "pcp_board_fake-key-b";
    const keyC = "pcp_board_fake-key-c";

    it("puts the earlier key back while the key it replaced is still held", async () => {
      const keys = keysForAcme();
      const putBack = keys.replace(halonic, { key: keyB, ...acme });
      putBack?.();
      const request = recordingRequest();
      await keys.callWith(halonic, acme, request);
      expect(request).toHaveBeenCalledWith({ key: fakeKey, origin: "https://paperclip.acme.test" });
    });

    it("keeps a newer key when a later sign-in replaced the one it would undo", async () => {
      const keys = keysForAcme();
      const putBackB = keys.replace(halonic, { key: keyB, ...acme });
      keys.replace(halonic, { key: keyC, ...acme });
      putBackB?.();
      const request = recordingRequest();
      await keys.callWith(halonic, acme, request);
      expect(request).toHaveBeenCalledWith({ key: keyC, origin: "https://paperclip.acme.test" });
    });

    it("keeps no key when Disconnect forgot the one it would undo", () => {
      const keys = keysForAcme();
      const putBackB = keys.replace(halonic, { key: keyB, ...acme });
      keys.forget(halonic);
      putBackB?.();
      expect(keys.has(halonic)).toBe(false);
    });
  });
});
