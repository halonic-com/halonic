import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessCall, ProcessResult } from "./node/run-process.ts";
import { checkRunCheckoutFiles } from "./run-checkout-files.ts";
import { installRunCheckout } from "./run-checkout-install.ts";

let checkout = "";
const registry = "https://registry.npmjs.org/";

beforeEach(async () => {
  checkout = await mkdtemp(join(tmpdir(), "halonic-checkout-"));
});

afterEach(async () => {
  await rm(checkout, { recursive: true, force: true });
});

async function put(name: string, text: string): Promise<void> {
  await mkdir(dirname(join(checkout, name)), { recursive: true });
  await writeFile(join(checkout, name), text);
}

const lockfileWith = (importer: string, resolution = ""): string =>
  `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n${importer}\n${resolution}`;

verifies("git.run-checkout-install", () => {
  describe("checkRunCheckoutFiles", () => {
    it("accepts a checkout with no settings files, or with the allowed settings", async () => {
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
      await put("pnpm-workspace.yaml", "packages:\n  - packages/*\nminimumReleaseAge: 4320\n");
      await put(".npmrc", "# nothing here\n\n");
      await mkdir(join(checkout, "packages/lib"), { recursive: true });
      await put(
        "pnpm-lock.yaml",
        lockfileWith(
          "      '@acme/lib':\n        specifier: workspace:*\n        version: link:packages/lib",
        ),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
    });

    it("refuses a folder setting in pnpm-workspace.yaml", async () => {
      await put("pnpm-workspace.yaml", "virtualStoreDir: ../outside-vs\nmodulesDir: ../outside\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "sets virtualStoreDir",
      );
    });

    it("refuses package folders outside the checkout", async () => {
      await put("pnpm-workspace.yaml", "packages:\n  - ../other/*\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a patch file outside the checkout", async () => {
      await put("pnpm-workspace.yaml", "patchedDependencies:\n  pkg@1.0.0: ../../host/x.patch\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a local override outside the checkout", async () => {
      await put("pnpm-workspace.yaml", "overrides:\n  pkg: file:../x\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a workspace file it can't read", async () => {
      await put("pnpm-workspace.yaml", "packages: [\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("can't be read");
    });

    it("refuses any setting in the checkout's .npmrc", async () => {
      await put(".npmrc", "# a comment\nregistry=https://elsewhere.example.com/\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("sets registry");
    });

    it("refuses a file: or link: dependency that leaves the checkout", async () => {
      await put(
        "pnpm-lock.yaml",
        lockfileWith("      pkg:\n        specifier: file:../x\n        version: file:../x"),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
      await put(
        "pnpm-lock.yaml",
        lockfileWith(
          "      pkg:\n        specifier: link:/srv/host-folder\n        version: link:/srv/host-folder",
        ),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a directory resolution that leaves the checkout", async () => {
      await put(
        "pnpm-lock.yaml",
        lockfileWith(
          "      pkg:\n        specifier: 1.0.0\n        version: 1.0.0",
          "packages:\n  pkg@1.0.0:\n    resolution: {directory: ../x, type: directory}\n",
        ),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a file: tarball outside the checkout", async () => {
      await put(
        "pnpm-lock.yaml",
        lockfileWith(
          "      pkg:\n        specifier: 1.0.0\n        version: 1.0.0",
          "packages:\n  pkg@1.0.0:\n    resolution: {tarball: 'file:../x.tgz'}\n",
        ),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("starts a project's link: from the project's own folder", async () => {
      await mkdir(join(checkout, "packages/lib"), { recursive: true });
      await mkdir(join(checkout, "packages/app"), { recursive: true });
      await put(
        "pnpm-lock.yaml",
        "lockfileVersion: '9.0'\nimporters:\n  packages/app:\n    dependencies:\n      lib:\n        specifier: workspace:*\n        version: link:../lib\n",
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
      await put(
        "pnpm-lock.yaml",
        "lockfileVersion: '9.0'\nimporters:\n  packages/app:\n    dependencies:\n      lib:\n        specifier: workspace:*\n        version: link:../../../lib\n",
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("checks both documents of a pnpm 12 lockfile", async () => {
      const pnpmDocument =
        "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    configDependencies: {}\n\n";
      await put(
        "pnpm-lock.yaml",
        `${pnpmDocument}---\nlockfileVersion: '9.0'\nimporters:\n  .: {}\n`,
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
      await put(
        "pnpm-lock.yaml",
        `${pnpmDocument}---\n${lockfileWith("      pkg:\n        specifier: file:../x\n        version: file:../x")}`,
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });

    it("refuses a project folder outside the checkout", async () => {
      await put("pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  ../other: {}\n");
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "outside the checkout",
      );
    });
  });

  describe("checkRunCheckoutFiles and links", () => {
    const linkLockfile = (path: string): string =>
      lockfileWith(`      pkg:\n        specifier: link:${path}\n        version: link:${path}`);

    it("refuses a committed link that leaves the checkout", async () => {
      const host = await mkdtemp(join(tmpdir(), "halonic-host-"));
      try {
        await symlink(host, join(checkout, "vendor"));
        await put("pnpm-lock.yaml", linkLockfile("vendor"));
        await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
          "outside the checkout",
        );
      } finally {
        await rm(host, { recursive: true, force: true });
      }
    });

    it("accepts a committed link that stays inside the checkout", async () => {
      await mkdir(join(checkout, "packages/lib"), { recursive: true });
      await symlink(join(checkout, "packages/lib"), join(checkout, "alias"));
      await put("pnpm-lock.yaml", linkLockfile("alias"));
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
    });

    it("refuses a patch file that is a link out of the checkout", async () => {
      const host = await mkdtemp(join(tmpdir(), "halonic-host-"));
      try {
        await writeFile(join(host, "x.patch"), "");
        await symlink(join(host, "x.patch"), join(checkout, "x.patch"));
        await put("pnpm-workspace.yaml", "patchedDependencies:\n  pkg@1.0.0: x.patch\n");
        await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
          "outside the checkout",
        );
      } finally {
        await rm(host, { recursive: true, force: true });
      }
    });

    it("refuses a path that doesn't exist", async () => {
      await put("pnpm-lock.yaml", linkLockfile("packages/missing"));
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("doesn't exist");
    });
  });

  describe("checkRunCheckoutFiles and sources", () => {
    const packageWith = (resolution: string): string =>
      lockfileWith(
        "      pkg:\n        specifier: 1.0.0\n        version: 1.0.0",
        `packages:\n  pkg@1.0.0:\n    resolution: ${resolution}\n`,
      );

    it("accepts the pinned registry, an integrity-only package and the Node runtime", async () => {
      for (const resolution of [
        "{integrity: sha512-abc, tarball: https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz}",
        "{integrity: sha512-abc}",
        "{type: variations, variants: [{resolution: {type: binary, archive: tarball, integrity: sha256-abc, url: 'https://nodejs.org/download/release/v1.0.0/node.tar.gz'}}]}",
      ]) {
        await put("pnpm-lock.yaml", packageWith(resolution));
        await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
      }
    });

    it("refuses a tarball on another host", async () => {
      await put(
        "pnpm-lock.yaml",
        packageWith("{integrity: sha512-abc, tarball: https://collector.example.com/pkg.tgz}"),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "collector.example.com",
      );
    });

    it("refuses a host that only starts like the registry", async () => {
      await put(
        "pnpm-lock.yaml",
        packageWith("{tarball: https://registry.npmjs.org.example.com/pkg.tgz}"),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("isn't the registry");
    });

    it("refuses a git source", async () => {
      await put(
        "pnpm-lock.yaml",
        packageWith("{type: git, repo: 'https://collector.example.com/x.git', commit: abc}"),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("git source");
    });

    it("refuses a download address inside a variant of another host", async () => {
      await put(
        "pnpm-lock.yaml",
        packageWith(
          "{type: variations, variants: [{resolution: {type: binary, url: 'https://collector.example.com/n.tgz'}}]}",
        ),
      );
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow(
        "collector.example.com",
      );
    });

    it("allows registries only when they name the pinned registry", async () => {
      await put("pnpm-workspace.yaml", `registries:\n  "@acme": ${registry}\n`);
      await expect(checkRunCheckoutFiles(checkout, registry)).resolves.toBeUndefined();
      await put("pnpm-workspace.yaml", 'registries:\n  "@acme": https://collector.example.com/\n');
      await expect(checkRunCheckoutFiles(checkout, registry)).rejects.toThrow("@acme");
    });
  });

  describe("installRunCheckout with a hostile checkout", () => {
    it("refuses a file: dependency outside the checkout before pnpm starts", async () => {
      await put(
        "package.json",
        '{"name":"x","version":"1.0.0","dependencies":{"other":"file:../y"}}',
      );
      await put(
        "pnpm-lock.yaml",
        "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      other:\n        specifier: file:../y\n        version: file:../y\npackages:\n  other@file:../other:\n    resolution: {directory: ../y, type: directory}\n",
      );
      const started: ProcessCall[] = [];
      const run = async (call: ProcessCall): Promise<ProcessResult> => {
        started.push(call);
        return { code: 0, stdout: Buffer.alloc(0), stderr: "" };
      };
      await expect(installRunCheckout(checkout, { run, pnpm: process.execPath })).rejects.toThrow(
        "outside the checkout",
      );
      expect(started).toHaveLength(0);
      expect(existsSync(join(checkout, "node_modules"))).toBe(false);
    });

    it("refuses it with the real pnpm too, and creates nothing", async () => {
      await put(
        "package.json",
        '{"name":"x","version":"1.0.0","dependencies":{"other":"file:../y"}}',
      );
      await put(
        "pnpm-lock.yaml",
        "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      other:\n        specifier: file:../y\n        version: file:../y\n",
      );
      await expect(installRunCheckout(checkout)).rejects.toThrow("outside the checkout");
      expect(existsSync(join(checkout, "node_modules"))).toBe(false);
    });
  });
});
