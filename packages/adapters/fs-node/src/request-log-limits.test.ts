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
  PathMasking,
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

    it("masks the 200 slow paths of one write against 4 MB of code quickly", () => {
      // `e.e` starts like the code at every `e` and is never in it whole, so each scan of it reads
      // all 4 MB: about 10 ms, and 12,800 of them in a write without a bound (Julian, HAL-19291).
      // The code is read and indexed once per write before any path is masked, so only the
      // masking is timed, as for the path at the URL limit above.
      const code = codeIndex("e ".repeat(2_000_000));
      const paths = Array.from({ length: 200 }, (_, n) => `/${n}${"/e.e".repeat(64)}`);
      const started = performance.now();
      const masking = new PathMasking(code);
      const masked = paths.map((path) => masking.path(path));
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(masked.at(-1)).toBe("/{…}".repeat(64));
    });

    it("masks every waiting path in one write, with one masking", async () => {
      const { held, release, writing } = heldWrites(requestLogFilesIn(profile));
      const store = new RequestLogStore(held);
      const slow = (n: number) => ({ ...refused, path: `/${n}${"/e.e".repeat(64)}` });
      const writes = [store.addRequest(workspace, "shop", slow(0), "e e")];
      await writing;
      for (let n = 1; n <= 200; n += 1) {
        writes.push(store.addRequest(workspace, "shop", slow(n), "e e"));
      }
      release();
      await Promise.all(writes);
      const lines = await store.lines(workspace, "shop");
      expect(lines).toHaveLength(200);
      expect(lines.at(-1)).toMatchObject({ path: "/{…}".repeat(64) });
    });

    it("scans the code once for a segment that many paths of one write share", () => {
      const masking = new PathMasking(codeIndex("get('/a.b/' + id)"), 1);
      expect(masking.path("/a.b/1")).toBe("/a.b/{…}");
      expect(masking.path("/a.b/2")).toBe("/a.b/{…}");
      // The one scan is spent: a new segment that needs one is masked.
      expect(masking.path("/c.d")).toBe("/{…}");
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
