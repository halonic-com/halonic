import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupOpener, sheet } from "./test/open-local-integration-setup.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

let base: string;
/** The workspace folder, where the integration was trusted. */
let saved: string;
/** The folder a run starts the runner from, as a copy of a commit is. */
let copy: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "halonic-cli-integration-folder-"));
  saved = join(base, "acme");
  copy = join(base, "copy");
  await put(saved, {
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/backend/index.js": "export default {};\n",
  });
  await cp(saved, copy, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(base);
});

async function put(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

const changedCode = { "integrations/notes/backend/index.js": "export default { changed: 1 };\n" };

verifies("cli.local-integration-runner-folder", () => {
  describe("openLocalIntegration with a runner that starts from a copy", () => {
    it("starts the copy's code when it is the trusted code, though the saved folder has changed since", async () => {
      const { seen, client } = await setupOpener(saved, { startFrom: copy });
      await put(saved, changedCode);
      const opened = client();
      expect(await opened.callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.entries).toEqual([
        `${join(copy, "integrations/notes/backend/index.js")}#default`,
      ]);
      await opened.close();
    });

    it("refuses when the copy's code isn't the trusted code, though the saved folder still is, and starts no runner", async () => {
      const { seen, client } = await setupOpener(saved, { startFrom: copy });
      await put(copy, changedCode);
      await expect(client().callTool("read-note", {})).rejects.toThrow(/didn't start/);
      expect(seen.starts).toBe(0);
    });

    it("refuses when the copy's sheet isn't the trusted one, and starts no runner", async () => {
      const { seen, client } = await setupOpener(saved, { startFrom: copy });
      await put(copy, {
        "integrations/notes/integration.yaml": sheet.replace(
          "api.example.com",
          "other.example.com",
        ),
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(/didn't start/);
      expect(seen.starts).toBe(0);
    });
  });
});
