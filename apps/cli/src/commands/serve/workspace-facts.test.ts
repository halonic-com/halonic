import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { committedVersions } from "../../test/committed-versions.ts";
import { sampleWorkspaceId, servedWorkspaceFacts } from "./workspace-facts.ts";

/** The sample's own `workspace.yaml`, from this test in `apps/cli/src/commands/serve`. */
const sampleWorkspaceFile = join(import.meta.dirname, "../../../../../examples/acme/workspace.yaml");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-workspace-facts-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** This test starts a real git repository and commits twice (see `committedVersions`). */
const slowTest = { timeout: 60_000 };

describe("the facts a served workspace gives GET /api/workspace", () => {
  verifies("cli.commands.serve.serve", () => {
    it(
      "names a renamed workspace once the rename is committed, before a run starts",
      slowTest,
      async () => {
        writeFileSync(join(root, "workspace.yaml"), "id: acme-shop\nname: Acme\n");
        const { dir, versions, commitAll } = await committedVersions(root);
        try {
          const describe = servedWorkspaceFacts({
            workspace: () => versions.live(),
            dir,
            folder: root,
            home: tmpdir(),
          });
          expect(await describe()).toEqual({
            name: "Acme",
            sample: false,
            folder: root,
            home: tmpdir(),
          });

          writeFileSync(join(root, "workspace.yaml"), "id: acme-shop\nname: Acme Support\n");
          // Saved but not committed: the live version still names it Acme.
          expect((await describe()).name).toBe("Acme");
          await commitAll();

          expect((await describe()).name).toBe("Acme Support");
          // No run started from the new version, so the one read last is still the first.
          expect(filesOf(versions.latest(), "workspace")[0]?.value.name).toBe("Acme");
        } finally {
          await versions.close();
        }
      },
    );
  });

    it("marks a copy of the sample, by the id its workspace.yaml carries", slowTest, async () => {
      writeFileSync(join(root, "workspace.yaml"), readFileSync(sampleWorkspaceFile, "utf8"));
      const { dir, versions } = await committedVersions(root);
      try {
        const describe = servedWorkspaceFacts({
          workspace: () => versions.live(),
          dir,
          folder: root,
          home: tmpdir(),
        });
        expect((await describe()).sample).toBe(true);
      } finally {
        await versions.close();
      }
    });

    it("keeps its sample id the same as the sample's own workspace.yaml", () => {
      const sampleId = /^id: (\S+)$/mu.exec(readFileSync(sampleWorkspaceFile, "utf8"))?.[1];
      expect(sampleId).toBe(sampleWorkspaceId);
    });
  });
});
