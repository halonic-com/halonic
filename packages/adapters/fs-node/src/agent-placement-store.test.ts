import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  readdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
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

// Attacks on the files (Julian, HAL-2927).
verifies("fs-node.agent-placement-store-files", () => {
  describe("attacks on the placement files", () => {
    /** A store with `coder`'s choice saved, and the root it lives in. */
    async function saved() {
      const root = join(await tempFolder(), "placements");
      const store = new FileAgentPlacementStore(root);
      await store.save(agentPlacement(coder.location, coder.agent));
      return { root, store };
    }

    /** Writes `record` as JSON over `coder`'s file, the way a hand edit would. */
    async function handEdit(root: string, record: unknown): Promise<void> {
      await writeFile(fileFor(root, coder), JSON.stringify(record), "utf8");
    }

    it("refuses a choice copied from the same agent id in another workspace", async () => {
      const { root, store } = await saved();
      const other = { location: "/workspaces/other", agent: "coder" };
      await writeFile(fileFor(root, other), await readFile(fileFor(root, coder), "utf8"), "utf8");

      await expect(store.get(other)).rejects.toThrow('the agent "coder" in "/workspaces/other"');
    });

    it("refuses a hand edit that points the file at another agent", async () => {
      const { root, store } = await saved();
      await handEdit(root, agentPlacement(writer.location, writer.agent));

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
    });

    it.each([
      ["an array", []],
      [
        "a location that isn't text",
        { ...agentPlacement(coder.location, coder.agent), location: 1 },
      ],
      ["no agent", { location: coder.location, runsOn: "this-computer" }],
    ])("refuses a file that holds %s", async (_kind, record) => {
      const { root, store } = await saved();
      await handEdit(root, record);

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
    });

    // Not only `location` and `agent`: any other shape is damaged too.
    it.each([
      ["a choice other than this computer", { runsOn: "sandbox" }],
      ["a fingerprint that isn't text", { agentFingerprint: 42 }],
      ["no fingerprint", { agentFingerprint: undefined }],
      ["a time that isn't text", { chosenAt: 0 }],
      ["an extra field a harness could read", { sandbox: false, command: ["sh", "-c", "id"] }],
    ])("refuses a file with %s", async (_kind, change) => {
      const { root, store } = await saved();
      await handEdit(root, { ...agentPlacement(coder.location, coder.agent), ...change });

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
    });

    it("names the agent when its file is huge and not JSON", async () => {
      const { root, store } = await saved();
      await writeFile(fileFor(root, coder), "{".repeat(8 * 1024 * 1024), "utf8");

      await expect(store.get(coder)).rejects.toThrow('the agent "coder" in "/workspaces/acme"');
      await store.remove(coder);
      expect(await store.get(coder)).toBeNull();
    });

    describe.skipIf(process.platform === "win32")("links and permissions", () => {
      /** A valid choice for `coder` in a file outside the store's root, such as in a workspace. */
      async function outsideChoice(): Promise<string> {
        const outside = join(await tempFolder(), "placement.json");
        await writeFile(
          outside,
          JSON.stringify(agentPlacement(coder.location, coder.agent)),
          "utf8",
        );
        return outside;
      }

      // A link could put the choice in a file an agent may edit, such as one
      // inside its workspace.
      it("refuses a choice that is a link to a file outside the folder", async () => {
        const root = join(await tempFolder(), "placements");
        await mkdir(root, { recursive: true });
        await symlink(await outsideChoice(), fileFor(root, coder));

        await expect(new FileAgentPlacementStore(root).get(coder)).rejects.toThrow('"coder"');
      });

      it("refuses a choice that is a hard link to a file outside the folder", async () => {
        const root = join(await tempFolder(), "placements");
        await mkdir(root, { recursive: true });
        await link(await outsideChoice(), fileFor(root, coder));

        await expect(new FileAgentPlacementStore(root).get(coder)).rejects.toThrow('"coder"');
      });

      it("saves over a link without writing through it", async () => {
        const root = join(await tempFolder(), "placements");
        await mkdir(root, { recursive: true });
        const outside = await outsideChoice();
        const before = await readFile(outside, "utf8");
        await symlink(outside, fileFor(root, coder));

        const store = new FileAgentPlacementStore(root);
        await store.save(agentPlacement(coder.location, coder.agent, "sha256:new"));
        expect(await readFile(outside, "utf8")).toBe(before);
        expect((await lstat(fileFor(root, coder))).isSymbolicLink()).toBe(false);
        expect((await stat(fileFor(root, coder))).mode & 0o777).toBe(0o600);
      });

      it("removes a link without touching what it points to", async () => {
        const root = join(await tempFolder(), "placements");
        await mkdir(root, { recursive: true });
        const outside = await outsideChoice();
        await symlink(outside, fileFor(root, coder));

        await new FileAgentPlacementStore(root).remove(coder);
        expect(await readdir(root)).toEqual([]);
        expect(JSON.parse(await readFile(outside, "utf8"))).toEqual(
          agentPlacement(coder.location, coder.agent),
        );
      });

      it("keeps a file private after it is saved over one anybody could read", async () => {
        const { root, store } = await saved();
        await chmod(fileFor(root, coder), 0o666);

        await store.save(agentPlacement(coder.location, coder.agent, "sha256:new"));
        expect((await stat(fileFor(root, coder))).mode & 0o777).toBe(0o600);
      });

      // `mkdir` sets the mode only on a folder it creates, so a folder made
      // earlier by something else needs a `chmod`.
      it("makes a folder that was already there private on save", async () => {
        const root = join(await tempFolder(), "placements");
        await mkdir(root, { mode: 0o777 });
        await chmod(root, 0o777);

        await new FileAgentPlacementStore(root).save(agentPlacement(coder.location, coder.agent));
        expect((await stat(root)).mode & 0o777).toBe(0o700);
      });
    });
  });
});
