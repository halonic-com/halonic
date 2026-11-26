import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import type { RunnerBlock } from "@halonicjs/adapter-integration-runner";
import { ConnectorPauses } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clock, setupOpener, sheet } from "./test/open-local-integration-setup.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

const hostBlock: RunnerBlock = { kind: "host-not-declared", host: "undeclared.example.net" };
const leakBlock: RunnerBlock = { kind: "leak-attempt", code: "secret-in-request" };

/** What a call of a paused connector fails with. */
const paused = /The connector "notes" is paused/;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-integration-pause-"));
  await put({
    "integrations/notes/integration.yaml": sheet,
    "integrations/notes/backend/index.js": "export default {};\n",
  });
});

afterEach(async () => {
  await removeTestFolder(root);
});

async function put(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/**
 * The opener with a runner whose first call is blocked with `block` and whose
 * later calls answer. `stoppedBeforeRefusal` says whether the runner was
 * already stopped when the refusal would have gone back to the code.
 */
async function blockedOnce(block: RunnerBlock) {
  let calls = 0;
  const code = { stoppedBeforeRefusal: false };
  const opener = await setupOpener(root, {
    tool: async (_http, report) => {
      calls += 1;
      if (calls > 1) return "answer";
      report(block);
      code.stoppedBeforeRefusal = opener.seen.stops === 1;
      return "the refusal";
    },
  });
  return { ...opener, code };
}

verifies("cli.local-integration-pause", () => {
  describe("a local integration blocked for a host or a leak", () => {
    it.each([
      ["an undeclared host", hostBlock],
      ["a secret in a request", leakBlock],
    ])(
      "pauses the connector after %s: no later call starts a runner, in this run or a new one",
      async (_, block) => {
        const { seen, client, code, pauses, pausesFolder } = await blockedOnce(block);
        const connector = client();
        await expect(connector.callTool("read-note", {})).rejects.toThrow(paused);
        expect(code.stoppedBeforeRefusal).toBe(true);

        await expect(connector.callTool("read-note", {})).rejects.toThrow(paused);
        await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
        expect(seen.starts).toBe(1);

        await pauses.saved();
        const newRun = await setupOpener(root, { pausesFolder });
        await expect(newRun.client().callTool("read-note", {})).rejects.toThrow(paused);
        expect(newRun.seen.starts).toBe(0);
      },
    );

    it("fails both of two calls fired together, the blocked one and the one beside it", async () => {
      let calls = 0;
      const { seen, client } = await setupOpener(root, {
        tool: async (_http, report) => {
          calls += 1;
          if (calls === 1) report(hostBlock);
          return await new Promise<string>(() => {});
        },
      });
      const connector = client();
      const both = [connector.callTool("read-note", {}), connector.callTool("read-note", {})];
      for (const call of both) await expect(call).rejects.toThrow(paused);
      const next = [connector.callTool("read-note", {}), connector.callTool("read-note", {})];
      for (const call of next) await expect(call).rejects.toThrow(paused);
      expect(seen.starts).toBe(1);
    });

    it("starts the connector again once its code changed and the workspace is trusted again", async () => {
      const { seen, client, trustAgain } = await blockedOnce(hostBlock);
      await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
      await put({ "integrations/notes/backend/index.js": "export default { fixed: true };\n" });
      await trustAgain();
      expect(await client().callTool("read-note", {})).toBe("answer");
      expect(seen.starts).toBe(2);
    });

    it("keeps it paused when the same code is trusted again", async () => {
      const { seen, client, trustAgain } = await blockedOnce(hostBlock);
      await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
      await trustAgain();
      await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
      expect(seen.starts).toBe(1);
    });

    it("leaves another connector of the same integration folder running", async () => {
      const { client } = await blockedOnce(hostBlock);
      await expect(client("notes").callTool("read-note", {})).rejects.toThrow(paused);
      expect(await client("notes-copy").callTool("read-note", {})).toBe("answer");
    });

    it("starts the connector again once its pause is removed", async () => {
      const { client, pauses, pausesFolder } = await blockedOnce(hostBlock);
      await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
      await pauses.saved();
      const records = new FileRecordStore(pausesFolder);
      await new ConnectorPauses({ records, place: pausesFolder, clock }).remove(root, "notes");
      const newRun = await setupOpener(root, { pausesFolder });
      expect(await newRun.client().callTool("read-note", {})).toBe("answer from read-note");
    });

    it("starts no connector when the paused connectors can't be read, and names the file", async () => {
      const { client, pauses, pausesFolder } = await blockedOnce(hostBlock);
      await expect(client().callTool("read-note", {})).rejects.toThrow(paused);
      await pauses.saved();
      const [log] = (await readdir(pausesFolder)).filter((name) => name.endsWith(".jsonl"));
      if (log === undefined) throw new Error("the pause wasn't saved");
      await writeFile(join(pausesFolder, log), "not a record\n");
      const newRun = await setupOpener(root, { pausesFolder });
      await expect(newRun.client().callTool("read-note", {})).rejects.toThrow(
        `The paused connectors can't be read (${JSON.stringify(join(pausesFolder, log))})`,
      );
      expect(newRun.seen.starts).toBe(0);
    });

    it("doesn't pause for a protocol block", async () => {
      const { client, code, pausesFolder } = await blockedOnce({
        kind: "protocol",
        detail: "a frame outside the protocol",
      });
      expect(await client().callTool("read-note", {})).toBe("the refusal");
      expect(code.stoppedBeforeRefusal).toBe(false);
      const newRun = await setupOpener(root, { pausesFolder });
      expect(await newRun.client().callTool("read-note", {})).toBe("answer from read-note");
    });
  });
});
