import { mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ProfileFolder } from "@halonicjs/profile";
import { workspaceFolders } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileRequestLogs, workspaceRequestLog } from "./integration-request-logs.ts";
import { setupOpener, sheet } from "./test/open-local-integration-setup.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

let root: string;
let profile: ProfileFolder;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-request-log-"));
  profile = { platform: "linux", root: join(root, "profile") };
  const files = {
    "workspace/integrations/notes/integration.yaml": sheet,
    "workspace/integrations/notes/backend/index.js": "export default { path: '/v2' };\n",
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
});

afterEach(async () => {
  await removeTestFolder(root);
});

/** The integration `notes` in the workspace, whose tool requests `url` and lets a refusal pass. */
async function notesRequesting(url: string) {
  const workspace = join(root, "workspace");
  const { client } = await setupOpener(workspace, {
    requestLog: () => workspaceRequestLog(profile, workspace),
    tool: async (http) => {
      await http.fetch(url).catch(() => undefined);
      return "done";
    },
  });
  const { key } = await workspaceFolders(profile, await realpath(workspace), webCryptoDigest);
  return { client, key, logFile: join(profile.root, "integration-logs", key, "notes.jsonl") };
}

verifies("cli.open-local-integration", () => {
  describe("the local request log", () => {
    it("keeps a refused request in the profile, and two loads share one store", async () => {
      const { client, key, logFile } = await notesRequesting(
        "https://elsewhere.example.com/v2/orders/1001",
      );
      await client().callTool("read-note", {});
      await client().callTool("read-note", {});
      const log = await workspaceRequestLog(profile, join(root, "workspace"));
      expect(log.store).toBe(profileRequestLogs(profile));
      expect(log.workspace).toBe(key);
      // Waits for the writes the two loads started.
      expect(await log.store.lines(key, "notes")).toHaveLength(2);
      const lines = (await readFile(logFile, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines).toEqual([
        expect.objectContaining({
          type: "request",
          host: "elsewhere.example.com",
          path: "/v2/{…}/{…}",
          outcome: "refused",
        }),
        expect.objectContaining({ path: "/v2/{…}/{…}", outcome: "refused" }),
      ]);
      expect((await stat(logFile)).mode & 0o777).toBe(0o600);
    });

    it("leaves no folder once a forgotten workspace's integration, still loaded, makes calls", async () => {
      const { client, key } = await notesRequesting("https://api.example.com/v2/notes");
      const loaded = client();
      await loaded.callTool("read-note", {});
      const store = profileRequestLogs(profile);
      expect(await store.lines(key, "notes")).toHaveLength(1);
      await store.forgetWorkspace(key);
      await loaded.callTool("read-note", {});
      expect(await store.lines(key, "notes")).toEqual([]);
      await expect(stat(join(profile.root, "integration-logs", key))).rejects.toThrow(/ENOENT/);
      await loaded.close();
    });
  });
});
