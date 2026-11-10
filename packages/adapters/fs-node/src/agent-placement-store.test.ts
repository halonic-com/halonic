import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentPlacementKey } from "@halonicjs/ports";
import { agentPlacement, agentPlacementStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileAgentPlacementStore } from "./agent-placement-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const coder: AgentPlacementKey = { location: "/workspaces/acme", agent: "coder" };
const writer: AgentPlacementKey = { location: "/workspaces/acme", agent: "writer" };

/** The file `FileAgentPlacementStore` keeps the choice for `key` in. */
function fileFor(root: string, key: AgentPlacementKey): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([key.location, key.agent]), "utf16le")
    .digest("hex");
  return join(root, `${hash}.json`);
}

agentPlacementStoreContract("file", async () => {
  const root = await tempFolder();
  return {
    store: new FileAgentPlacementStore(root),
    // Cut the file in half, as a crash or a full disk would.
    damage: async (key) => {
      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      await writeFile(file, text.slice(0, text.length / 2), "utf8");
    },
  };
});

verifies("fs-node.agent-placement-store-files", () => {
  describe("the files", () => {
    it("keeps each choice in a file named by the hash of its key, key first", async () => {
      const root = join(await tempFolder(), "placements");
      const key = { location: "/Workspaces/Café", agent: "coder" };
      await new FileAgentPlacementStore(root).save(agentPlacement(key.location, key.agent));

      const file = fileFor(root, key);
      const text = await readFile(file, "utf8");
      expect(text.startsWith('{\n  "location": "/Workspaces/Café",\n  "agent": "coder",')).toBe(
        true,
      );
      expect(JSON.parse(text)).toEqual(agentPlacement(key.location, key.agent));
      expect(await readdir(root)).toEqual([file.slice(-69)]);
    });

    it("keeps a location ending in / apart from an agent id starting with one", async () => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      await store.save(agentPlacement("/a/", "b"));

      expect(await store.get({ location: "/a", agent: "/b" })).toBeNull();
      expect(await readdir(root)).toHaveLength(1);
    });

    it.skipIf(process.platform === "win32")(
      "makes the folder and the files private to the user",
      async () => {
        const root = join(await tempFolder(), "placements");
        await new FileAgentPlacementStore(root).save(agentPlacement(coder.location, coder.agent));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(fileFor(root, coder))).mode & 0o777).toBe(0o600);
      },
    );

    it("reads a folder that isn't there yet as having no choices", async () => {
      const store = new FileAgentPlacementStore(join(await tempFolder(), "placements"));
      expect(await store.get(coder)).toBeNull();
      await store.remove(coder);
    });
  });

  describe("a choice that can't be read", () => {
    it("doesn't let one agent borrow another agent's choice", async () => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      await store.save(agentPlacement(coder.location, coder.agent));
      // A choice copied over another agent's file.
      await writeFile(fileFor(root, writer), await readFile(fileFor(root, coder), "utf8"), "utf8");

      await expect(store.get(writer)).rejects.toThrow('"writer"');
      expect(await store.get(coder)).toEqual(agentPlacement(coder.location, coder.agent));
    });

    it.each([
      ["JSON that isn't an object", "null"],
      ["only an opening brace", "{"],
    ])("names the agent and its workspace when the file holds %s", async (_kind, text) => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      await writeFile(fileFor(root, coder), text, "utf8");

      const reading = store.get(coder);
      await expect(reading).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
      await store.remove(coder);
      expect(await store.get(coder)).toBeNull();
    });
  });

  describe("a file system error", () => {
    it("names the agent when its choice is a folder", async () => {
      const root = await tempFolder();
      await mkdir(join(fileFor(root, coder), "inside"), { recursive: true });

      await expect(new FileAgentPlacementStore(root).get(coder)).rejects.toThrow('"coder"');
    });

    it("leaves no temporary file behind when a save fails", async () => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      // A folder with something in it can't be renamed over.
      await mkdir(join(fileFor(root, coder), "inside"), { recursive: true });

      await expect(store.save(agentPlacement(coder.location, coder.agent))).rejects.toThrow();
      expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });
});
