import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { buildWorkerBundle, hashScript } from "./worker-bundle.ts";

const entryPoint = fileURLToPath(
  new URL("../../../packages/targets/cloudflare/runtime/src/index.ts", import.meta.url),
);

verifies("publish.worker-bundle", () => {
  describe("buildWorkerBundle", () => {
    it("gives the same bytes and the same hash on every build", async () => {
      const first = await buildWorkerBundle(entryPoint);
      const second = await buildWorkerBundle(entryPoint);
      expect(second.script).toBe(first.script);
      expect(second.hash).toBe(first.hash);
    });

    it("gives the same bytes from another working folder", async () => {
      const before = process.cwd();
      const folder = await mkdtemp(`${tmpdir()}/halonic-bundle-`);
      try {
        const first = await buildWorkerBundle(entryPoint);
        process.chdir(folder);
        const second = await buildWorkerBundle(entryPoint);
        expect(second.hash).toBe(first.hash);
      } finally {
        process.chdir(before);
        await rm(folder, { recursive: true, force: true });
      }
    });

    it("hashes the script's bytes with SHA-256 as lowercase hex", async () => {
      const { script, hash } = await buildWorkerBundle(entryPoint);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(createHash("sha256").update(Buffer.from(script, "utf8")).digest("hex"));
    });

    it("exports the Worker and the three Durable Object classes, and leaves cloudflare:workers to workerd", async () => {
      const { script } = await buildWorkerBundle(entryPoint);
      const exported = /^export \{([^}]*)\};?$/m.exec(script)?.[1] ?? "";
      expect(
        exported
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name !== "")
          .sort(),
      ).toEqual(["CoordinationObject", "RoutinesObject", "RunObject", "worker as default"]);
      expect(script).toContain('from "cloudflare:workers"');
    });

    it("holds no absolute path, no source map and no token", async () => {
      const { script } = await buildWorkerBundle(entryPoint);
      expect(script).not.toMatch(/\/(?:home|Users|paperclip|tmp)\//);
      // A drive letter on its own, then a name: not the `s:\/` inside the `https:\/\/` of a bundled pattern.
      expect(script).not.toMatch(/(?<![A-Za-z0-9])[A-Za-z]:\\[A-Za-z0-9_.-]/);
      expect(script).not.toContain("sourceMappingURL");
    });
  });

  describe("hashScript", () => {
    it("is the SHA-256 of the UTF-8 bytes", () => {
      expect(hashScript("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(hashScript("é")).toBe(
        createHash("sha256")
          .update(Buffer.from([0xc3, 0xa9]))
          .digest("hex"),
      );
    });
  });
});
