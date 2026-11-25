import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  readWranglerConfig,
  workerManifestFile,
  workerScriptFile,
  writeWorkerFiles,
} from "./worker-files.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));

// Each build bundles the real Worker (about 2.5 s on a quiet runner, HAL-10678).
const BUNDLE_TEST_TIMEOUT_MS = 60_000;

const wrangler = `name = "halonic-cloud"
compatibility_date = "2026-07-30" # pinned

[[durable_objects.bindings]]
name = "RUN"
class_name = "RunObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RunObject", "OtherObject"]

[triggers]
crons = ["* * * * *"]
`;

verifies("publish.worker-files", () => {
  describe("writeWorkerFiles", { timeout: BUNDLE_TEST_TIMEOUT_MS }, () => {
    it("writes the same two files on every build, the hash matching the script's bytes", async () => {
      const first = await mkdtemp(join(tmpdir(), "halonic-worker-"));
      const second = await mkdtemp(join(tmpdir(), "halonic-worker-"));
      try {
        await writeWorkerFiles(root, first);
        await writeWorkerFiles(root, second);
        for (const file of [workerScriptFile, workerManifestFile]) {
          expect(await readFile(join(second, file))).toEqual(await readFile(join(first, file)));
        }
        const script = await readFile(join(first, workerScriptFile));
        const manifest = JSON.parse(await readFile(join(first, workerManifestFile), "utf8"));
        expect(manifest.hash).toBe(createHash("sha256").update(script).digest("hex"));
      } finally {
        await rm(first, { recursive: true, force: true });
        await rm(second, { recursive: true, force: true });
      }
    });

    it("ships the runtime's own compatibility date and Durable Objects", async () => {
      const folder = await mkdtemp(join(tmpdir(), "halonic-worker-"));
      try {
        const manifest = await writeWorkerFiles(root, folder);
        const config = readWranglerConfig(
          await readFile(join(root, "packages/targets/cloudflare/runtime/wrangler.toml"), "utf8"),
        );
        expect(manifest).toEqual({ hash: manifest.hash, ...config });
        expect(config.durableObjects.map(({ class_name }) => class_name).sort()).toEqual([
          "CoordinationObject",
          "RoutinesObject",
          "RunContainerObject",
          "RunObject",
          "UsageObject",
        ]);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    });
  });

  describe("readWranglerConfig", () => {
    it("reads the date, the bindings and the migrations, and skips other parts", () => {
      expect(readWranglerConfig(wrangler)).toEqual({
        compatibilityDate: "2026-07-30",
        durableObjects: [{ name: "RUN", class_name: "RunObject" }],
        durableObjectMigrations: [{ tag: "v1", new_sqlite_classes: ["RunObject", "OtherObject"] }],
      });
    });

    it("refuses a migration it can't ship rather than leave it out", () => {
      const renamed = wrangler.replace(
        'tag = "v1"',
        'tag = "v1"\nrenamed_classes = [{from = "A", to = "B"}]',
      );
      expect(() => readWranglerConfig(renamed)).toThrow(
        /line 10: a migration with "renamed_classes"/,
      );
    });

    it("refuses a binding with a field it doesn't know", () => {
      const scripted = wrangler.replace(
        'class_name = "RunObject"',
        'class_name = "RunObject"\nscript_name = "other"',
      );
      expect(() => readWranglerConfig(scripted)).toThrow(/binding with "script_name"/);
    });

    it("refuses a value that isn't a plain quoted string", () => {
      expect(() => readWranglerConfig(wrangler.replace('"RUN"', "'RUN'"))).toThrow(
        /line 5 isn't a plain quoted string/,
      );
    });

    it("refuses a file without a compatibility date or a binding", () => {
      expect(() => readWranglerConfig(wrangler.replace(/^compatibility_date.*$/m, ""))).toThrow(
        /no compatibility_date/,
      );
      expect(() => readWranglerConfig('compatibility_date = "2026-07-30"\n')).toThrow(
        /no Durable Object binding/,
      );
    });

    it("refuses a migration without its classes", () => {
      expect(() => readWranglerConfig(wrangler.replace(/^new_sqlite_classes.*$/m, ""))).toThrow(
        /lacks its tag or new_sqlite_classes/,
      );
    });
  });
});
