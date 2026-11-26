// The request log's limits against an integration that makes refused
// requests in a tight loop (Julian, HAL-19169): what waits stays bounded,
// a write takes one code read for many lines, the masking's cost stays
// small at the bridge's URL limit, and a forget leaves no folder behind.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codeIndex,
  type LoggedRequest,
  maskedPath,
  type RequestLogFiles,
  RequestLogStore,
} from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestLogFilesIn } from "./request-log-files.ts";

const workspace = "0123456789abcdef0123456789abcdef";

const refused: LoggedRequest = {
  method: "GET",
  host: "elsewhere.example.com",
  path: "/v2/orders/1001",
  durationMs: 0,
  outcome: "refused",
  refusal: "host-not-allowed",
};

/** `files`, with each write waiting until `release` is called; `writing` settles once one waits. */
function heldWrites(files: RequestLogFiles) {
  const released = Promise.withResolvers<void>();
  const writing = Promise.withResolvers<void>();
  const held: RequestLogFiles = {
    ...files,
    write: async (folder, file, text) => {
      writing.resolve();
      await released.promise;
      await files.write(folder, file, text);
    },
  };
  return { held, release: () => released.resolve(), writing: writing.promise };
}

verifies("app.integration-request-log", () => {
  describe("the request log's limits", () => {
    let profile: string;

    beforeEach(async () => {
      profile = await mkdtemp(join(tmpdir(), "halonic-request-log-limits-"));
    });

    afterEach(async () => {
      await rm(profile, { recursive: true, force: true });
    });

    it("never keeps more than its limit waiting, and reads the code once per write", async () => {
      const { held, release, writing } = heldWrites(requestLogFilesIn(profile));
      const store = new RequestLogStore(held, { limit: 5 });
      let codeReads = 0;
      const readCode = async () => {
        codeReads += 1;
        return "get('/v2/orders/' + id)";
      };
      const writes = [store.addRequest(workspace, "shop", refused, readCode)];
      await writing;
      for (let n = 0; n < 10_000; n += 1) {
        writes.push(store.addRequest(workspace, "shop", refused, readCode));
        expect(store.pendingCount(workspace, "shop")).toBeLessThanOrEqual(5);
      }
      release();
      await Promise.all(writes);
      expect(codeReads).toBe(2);
      const lines = await store.lines(workspace, "shop");
      expect(lines).toHaveLength(5);
      expect(lines[0]).toMatchObject({ path: "/v2/orders/{…}", refusal: "host-not-allowed" });
    });

    it("masks a path at the bridge's 32 KiB URL limit against 4 MB of code quickly", () => {
      // `a.b` is only ever inside a longer word, and `q.z` isn't in the code at all.
      const code = codeIndex("get('/xa.bx/' + id); ".repeat(200_000));
      const path = `/${"a.b/q.z/".repeat(32_768 / 8)}`;
      const started = performance.now();
      const masked = maskedPath(path, code);
      expect(performance.now() - started).toBeLessThan(2_000);
      // The leading empty segment is one of the 64; the rest past them become one more {…}.
      expect(masked).toBe("/{…}".repeat(64));
    });

    it("masks a long segment that isn't a plain word without looking for it", () => {
      const segment = `${"a".repeat(200)}.b`;
      expect(maskedPath(`/${segment}`, codeIndex(`"/${segment}"`))).toBe("/{…}");
    });

    it("leaves no folder behind when the workspace is forgotten while writes wait", async () => {
      const { held, release, writing } = heldWrites(requestLogFilesIn(profile));
      const store = new RequestLogStore(held);
      const writes = [store.addRequest(workspace, "shop", refused, "/v2")];
      await writing;
      writes.push(store.addRequest(workspace, "shop", refused, "/v2"));
      writes.push(store.addRequest(workspace, "weather", refused, "/v2"));
      const forgotten = store.forgetWorkspace(workspace);
      writes.push(store.addRequest(workspace, "shop", refused, "/v2"));
      release();
      await Promise.all([...writes, forgotten]);
      expect(await readdir(join(profile, "integration-logs"))).toEqual([]);
      expect(store.pendingCount(workspace, "shop")).toBe(0);
    });

    it("drops what waits for an integration when it is removed", async () => {
      const { held, release, writing } = heldWrites(requestLogFilesIn(profile));
      const store = new RequestLogStore(held);
      const first = store.addRequest(workspace, "shop", refused, "/v2");
      await writing;
      const second = store.addRequest(workspace, "shop", refused, "/v2");
      const removed = store.removeIntegration(workspace, "shop");
      release();
      await Promise.all([first, second, removed]);
      expect(await store.lines(workspace, "shop")).toEqual([]);
    });
  });
});
