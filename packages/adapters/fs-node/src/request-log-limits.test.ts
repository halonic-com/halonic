// The request log's bounds (Julian, HAL-19170): a runner that makes refused
// requests in a tight loop can't grow what waits, re-read the code for every
// line, make masking slow, or bring back a forgotten workspace's folder.

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoggedRequest, type RequestLogFiles, RequestLogStore } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestLogFilesIn } from "./request-log-files.ts";

const workspace = "0123456789abcdef0123456789abcdef";
const limit = 200;

function refused(n: number, path = "/v2/orders"): LoggedRequest {
  return {
    method: "GET",
    host: "other.example.com",
    path,
    durationMs: n,
    outcome: "refused",
    refusal: "host-not-allowed",
  };
}

/** The profile's files, with every write held until `open()` and each write counted. */
function heldFiles(profile: string) {
  const files = requestLogFilesIn(profile);
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let entered: () => void = () => undefined;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const counts = { writes: 0, codeReads: 0 };
  const held: RequestLogFiles = {
    ...files,
    write: async (folder, file, text) => {
      counts.writes += 1;
      entered();
      await opened;
      await files.write(folder, file, text);
    },
  };
  const readCode = async () => {
    counts.codeReads += 1;
    return "http.fetch(`https://shop.example.com/v2/orders`);";
  };
  return { files: held, open, writing, counts, readCode };
}

/** Counts how many of the promises have settled so far. */
function settledCount(promises: readonly Promise<void>[]) {
  let settled = 0;
  for (const promise of promises) {
    void promise.then(
      () => {
        settled += 1;
      },
      () => {
        settled += 1;
      },
    );
  }
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return settled;
  };
}

verifies("app.integration-request-log", () => {
  describe("RequestLogStore's bounds", () => {
    let profile: string;

    beforeEach(async () => {
      profile = await mkdtemp(join(tmpdir(), "halonic-request-log-limits-"));
    });

    afterEach(async () => {
      await rm(profile, { recursive: true, force: true });
    });

    it("never leaves more than the limit waiting in a flood, and reads the code once per write", async () => {
      const held = heldFiles(profile);
      const store = new RequestLogStore(held.files, { limit });
      const first = store.addRequest(workspace, "shop", refused(-1), held.readCode);
      await held.writing;

      const flood: Promise<void>[] = [];
      for (let n = 0; n < 10_000; n += 1) {
        flood.push(store.addRequest(workspace, "shop", refused(n), held.readCode));
        if (n % 20 === 0) flood.push(store.addFailure(workspace, "shop", { tool: "order" }));
      }
      const settled = settledCount(flood);
      // Only the newest `limit` requests and `limit` notes still wait; the rest were dropped.
      expect(flood.length - (await settled())).toBe(2 * limit);

      held.open();
      await Promise.all([first, ...flood]);
      expect(held.counts).toEqual({ writes: 2, codeReads: 2 });
      const lines = await store.lines(workspace, "shop");
      const requests = lines.flatMap((line) => (line.type === "request" ? [line.durationMs] : []));
      expect(requests).toEqual(Array.from({ length: limit }, (_, n) => 10_000 - limit + n));
      expect(lines.filter((line) => line.type === "failure")).toHaveLength(limit);
    });

    it("masks a path at the bridge's 32 KiB limit against 4 MB of code in under 2 s", async () => {
      // Every `-x-` in the code has a word character beside it, so none counts,
      // and every word appears without the request's digits after a `/`.
      const code = `get("/v2/orders"); ${"a-x-a 1234 ".repeat(400_000)}`;
      const segments = ["v2", "orders", "1234", "-x-", "y.".repeat(101)];
      const pieces = Array.from({ length: 6_000 }, (_, n) => segments[n % segments.length]);
      const path = `/${pieces.join("/")}`.slice(0, 32 * 1024);
      const store = new RequestLogStore(requestLogFilesIn(profile));

      const started = performance.now();
      await store.addRequest(workspace, "shop", refused(0, path), async () => code);
      expect(performance.now() - started).toBeLessThan(2_000);

      const [line] = await store.lines(workspace, "shop");
      const kept = line?.type === "request" ? line.path.split("/") : [];
      expect(kept.slice(0, 6)).toEqual(["", "v2", "orders", "{…}", "{…}", "{…}"]);
      // Past the 64th segment, even a word the code holds is masked.
      expect(new Set(kept.slice(65).filter((segment) => segment !== ""))).toEqual(new Set(["{…}"]));
    });

    it("leaves no folder when the workspace is forgotten while writes wait", async () => {
      const held = heldFiles(profile);
      const store = new RequestLogStore(held.files);
      const adds = [
        store.addRequest(workspace, "shop", refused(0), held.readCode),
        store.addRequest(workspace, "weather", refused(0), held.readCode),
      ];
      await held.writing;
      adds.push(store.addRequest(workspace, "shop", refused(1), held.readCode));
      adds.push(store.addFailure(workspace, "weather", { tool: "forecast" }));

      const forgotten = store.forgetWorkspace(workspace);
      held.open();
      await forgotten;
      await Promise.all(adds);
      expect(await readdir(join(profile, "integration-logs"))).toEqual([]);
      expect(held.counts.writes).toBe(2);
    });

    it("drops what waits when the integration is removed", async () => {
      const held = heldFiles(profile);
      const store = new RequestLogStore(held.files);
      const adds = [store.addRequest(workspace, "shop", refused(0), held.readCode)];
      await held.writing;
      adds.push(store.addRequest(workspace, "shop", refused(1), held.readCode));
      adds.push(store.addFailure(workspace, "shop", { tool: "order" }));

      const removed = store.removeIntegration(workspace, "shop");
      held.open();
      await removed;
      await Promise.all(adds);
      expect(await store.lines(workspace, "shop")).toEqual([]);
      expect(held.counts).toEqual({ writes: 1, codeReads: 1 });
    });
  });
});
