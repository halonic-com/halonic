import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Phrase } from "../../messages/phrase.ts";
import { plainText } from "../../messages/phrase.ts";
import { committedVersions } from "../../test/committed-versions.ts";
import { servedWorkspaceFacts } from "./workspace-facts.ts";

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
        writeFileSync(join(root, "workspace.yaml"), "id: acme\nname: Acme\n");
        const { dir, versions, commitAll } = await committedVersions(root);
        try {
          const describe = servedWorkspaceFacts({
            workspace: () => versions.live(),
            template: async () => null,
            warn: () => expect.fail("no template, so no warning"),
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

          writeFileSync(join(root, "workspace.yaml"), "id: acme\nname: Acme Support\n");
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

    describe("sample, from the template's kind", () => {
      /** The Acme demo's own template, from this test in `apps/cli/src/commands/serve`. */
      const acmeTemplate = readFileSync(
        join(import.meta.dirname, "../../../../../examples/acme/template.yaml"),
        "utf8",
      );

      /** The facts of a workspace whose `template.yaml` reads as `templates` gives, one per request. */
      function factsWith(templates: (string | null)[], warnings: Phrase[]) {
        return servedWorkspaceFacts({
          workspace: () =>
            loadWorkspace(
              new MemoryDefinitionStore({ "workspace.yaml": "id: acme\nname: Acme\n" }),
            ),
          template: async () => templates.shift() ?? null,
          warn: (line) => warnings.push(line),
          dir: { root, shown: ".", name: "acme" },
          folder: root,
          home: tmpdir(),
        });
      }

      it("is true for a workspace whose template is a demo, such as a copy of Acme", async () => {
        const warnings: Phrase[] = [];
        expect((await factsWith([acmeTemplate], warnings)()).sample).toBe(true);
        expect(warnings).toEqual([]);
      });

      it("is false without a template, even for the id acme, and for a starter", async () => {
        const warnings: Phrase[] = [];
        const starter = acmeTemplate.replace("kind: demo", "kind: starter");
        const describe = factsWith([null, starter], warnings);
        expect((await describe()).sample).toBe(false);
        expect((await describe()).sample).toBe(false);
        expect(warnings).toEqual([]);
      });

      it("serves a template it can't read as no sample, with one ! line while it stays so", async () => {
        const warnings: Phrase[] = [];
        const newer = `${acmeTemplate}flows: []\n`;
        const describe = factsWith([newer, newer, acmeTemplate, newer], warnings);
        expect((await describe()).sample).toBe(false);
        expect((await describe()).sample).toBe(false);
        expect(warnings.map(plainText)).toEqual([
          '! Skipped template.yaml: line 11: There\'s no field "flows" in this file. A newer Halonic may read it.',
        ]);
        expect((await describe()).sample).toBe(true);
        expect((await describe()).sample).toBe(false);
        expect(warnings).toHaveLength(2);
      });
    });
  });
});
