import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { connectorStartFailureOf } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { integrationTransport } from "./local-integration-machine.ts";
import {
  fromSettingSheet,
  onWindows,
  setupOpener,
  sheet,
} from "./test/open-local-integration-setup.ts";
import { removeTestFolder } from "./test/remove-folder.ts";

/** The addresses each `https` connection was handed, in order. */
const connected = vi.hoisted(() => [] as string[][]);

// No test may reach a real network, so an `https` connection only records the
// addresses the transport's checked lookup hands it, then fails.
vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  const { EventEmitter } = await import("node:events");
  const request = (options: import("node:https").RequestOptions) => {
    options.lookup?.(options.hostname ?? "", { all: true }, (_error, entries) => {
      connected.push((entries as unknown as { address: string }[]).map((entry) => entry.address));
    });
    const outgoing = new EventEmitter();
    const fail = () => outgoing.emit("error", new Error("this test has no network"));
    return Object.assign(outgoing, { end: () => queueMicrotask(fail) });
  };
  return { ...actual, request };
});

let root: string;

beforeEach(async () => {
  connected.length = 0;
  root = await mkdtemp(join(tmpdir(), "halonic-cli-open-integration-"));
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

verifies("cli.open-local-integration", () => {
  describe("openLocalIntegration", () => {
    it("starts the runner from backend/index.js with the default export and calls its tool", async () => {
      const { seen, client } = await setupOpener(root);
      const opened = client();
      expect(await opened.callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.entries).toEqual([
        `${join(root, "integrations/notes/backend/index.js")}#default`,
      ]);
      await opened.close();
      expect(seen.stops).toBe(1);
    });

    it("refuses a folder that changed since it was trusted, and starts no runner", async () => {
      const { seen, client } = await setupOpener(root);
      await put({ "integrations/notes/backend/index.js": "export default { changed: true };\n" });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*only once the workspace is trusted/,
      );
      expect(seen.starts).toBe(0);
    });

    it("refuses when the sheet it read is not the trusted one, even if the folder is put back before the start", async () => {
      const { seen, client } = await setupOpener(root, {
        beforeTrustCheck: async () => await put({ "integrations/notes/integration.yaml": sheet }),
      });
      await put({
        "integrations/notes/integration.yaml": sheet.replace("api.example.com", "evil.example.com"),
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*changed since the workspace was trusted/,
      );
      expect(seen.starts).toBe(0);
    });

    it("checks the folder again at a later start, so a file edited between two starts is refused", async () => {
      const { seen, client } = await setupOpener(root);
      const first = client();
      await first.callTool("read-note", {});
      await first.close();
      await put({ "integrations/notes/backend/index.js": "export default { edited: true };\n" });
      await expect(client().callTool("read-note", {})).rejects.toThrow(/didn't start/);
      expect(seen.starts).toBe(1);
      expect(seen.checks).toBe(2);
    });

    it("refuses when the sandbox isn't there and running without it isn't allowed (Windows)", async () => {
      const { seen, client } = await setupOpener(root, { check: onWindows });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: the sandbox isn't available here \(windows\)/,
      );
      expect(seen.starts).toBe(0);
    });

    it("starts with the connector file's settings, so a { fromSetting } host reads its URL", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const settings = { url: "http://192.168.1.20:3100" };
      const { seen, client } = await setupOpener(root, { trustedSettings: settings });
      expect(await client().callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.settings).toEqual([settings]);
    });

    it("refuses when the connector file's URL changed since the workspace was trusted", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const { seen, client } = await setupOpener(root, {
        trustedSettings: { url: "http://192.168.1.20:3100" },
        runSettings: { url: "http://192.168.1.99:3100" },
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /Connector "notes" didn't start: .*from its settings, changed since the workspace was trusted/,
      );
      expect(seen.starts).toBe(0);
    });

    it("refuses when the integration runner isn't built, and starts no runner", async () => {
      const { seen, client } = await setupOpener(root, { runnerBuilt: false });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        "Connector \"notes\" didn't start: the integration runner isn't built",
      );
      expect(seen.starts).toBe(0);
    });

    it("points to WSL 2 when Studio's yes doesn't reach the command", async () => {
      const { seen, client } = await setupOpener(root, {
        check: onWindows,
        studioYesReaches: false,
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /^Connector "notes" didn't start: on Windows, integration code can't run in the sandbox in this version of Halonic\. Use Halonic inside WSL 2 on this computer\.$/,
      );
      expect(seen.starts).toBe(0);
    });
  });
});

verifies("format.integration-host-class", () => {
  describe("a private setting that holds a host name", () => {
    const name = "box.tail1234.ts.net";

    /** Opens the integration with its `url` set to the name, over the CLI's own transport answering `answers`. */
    async function privateName(answers: readonly string[]) {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const lookups: string[] = [];
      const transport = integrationTransport(async (hostname) => {
        lookups.push(hostname);
        return answers;
      });
      const { seen, client } = await setupOpener(root, {
        trustedSettings: { url: `https://${name}` },
        transport,
        tool: async (http) => await (await http.fetch(`https://${name}/notes`)).text(),
      });
      return { seen, lookups, call: () => client().callTool("read-note", {}) };
    }

    it("connects only to the private addresses of a mixed answer", async () => {
      const { lookups, call } = await privateName(["93.184.215.14", "100.116.12.34", "10.0.0.5"]);
      await expect(call()).rejects.toThrow();
      expect(lookups).toEqual([name]);
      expect(connected).toEqual([["100.116.12.34", "10.0.0.5"]]);
    });

    it.each([
      [["93.184.215.14"]],
      [["100.100.100.100"]],
      [["100.100.100.200", "169.254.169.254", "127.0.0.1"]],
    ])("refuses a name whose answer is %j before any connection", async (answers) => {
      const { seen, lookups, call } = await privateName(answers);
      await expect(call()).rejects.toThrow(/no address a private host may reach/);
      expect(seen.starts).toBe(1);
      expect(lookups).toEqual([name]);
      expect(connected).toEqual([]);
    });

    it("refuses it on a transport that can't check where a name points, and starts no runner", async () => {
      await put({ "integrations/notes/integration.yaml": fromSettingSheet });
      const { seen, client } = await setupOpener(root, {
        trustedSettings: { url: `https://${name}` },
        transport: { fetch: async () => new Response("{}") } as never,
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /can't check that box\.tail1234\.ts\.net points to a private address/,
      );
      expect(seen.starts).toBe(0);
    });
  });
});

verifies("cli.local-integration-unfenced-yes", () => {
  describe("openLocalIntegration where the sandbox can't start", () => {
    it("starts with the user's yes for this reason, and says so once per start", async () => {
      const { seen, client } = await setupOpener(root, { check: onWindows, savedYes: "windows" });
      expect(await client().callTool("read-note", {})).toBe("answer from read-note");
      expect(seen.starts).toBe(1);
      expect(seen.unfenced).toEqual(["windows"]);
    });

    it("refuses with no yes, and says where to give it", async () => {
      const { seen, client } = await setupOpener(root, { check: onWindows });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        "Connector \"notes\" didn't start: the sandbox isn't available here (windows) and running without it isn't allowed yet. To allow it, trust this workspace in Studio on this computer.",
      );
      expect(seen.starts).toBe(0);
      expect(seen.unfenced).toEqual([]);
    });

    it("refuses with an error the engine reads as the gate's reason, without the message", async () => {
      const { client } = await setupOpener(root, { check: onWindows });
      const refused = await client()
        .callTool("read-note", {})
        .catch((error: unknown) => error);
      expect(connectorStartFailureOf(refused)).toEqual({
        reason: "unfenced-not-allowed",
        sandbox: "windows",
      });
    });

    it("refuses when the saved yes can't be read, and names its file", async () => {
      const file = join(root, "profile", "unfenced-runs", "consent.json");
      const { seen, client } = await setupOpener(root, { check: onWindows, unreadableYes: file });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        `the saved yes to run without it can't be read (${JSON.stringify(file)}), so nothing runs. To allow it, trust this workspace in Studio on this computer.`,
      );
      expect(seen.starts).toBe(0);
    });

    it("points to WSL 2 when Studio's yes doesn't reach the command", async () => {
      const { seen, client } = await setupOpener(root, {
        check: onWindows,
        studioYesReaches: false,
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /^Connector "notes" didn't start: on Windows, integration code can't run in the sandbox in this version of Halonic\. Use Halonic inside WSL 2 on this computer\.$/,
      );
      expect(seen.starts).toBe(0);
    });

    it("points to WSL 2 for a yes it can't read when Studio's yes doesn't reach the command", async () => {
      const file = join(root, "profile", "unfenced-runs", "consent.json");
      const { seen, client } = await setupOpener(root, {
        check: onWindows,
        unreadableYes: file,
        studioYesReaches: false,
      });
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        `the saved yes to run without the sandbox can't be read (${JSON.stringify(file)}), and on Windows, integration code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer.`,
      );
      expect(seen.starts).toBe(0);
    });
  });
});

verifies("cli.local-integration-stopped", () => {
  describe("openLocalIntegration where the runner's fence doesn't hold", () => {
    it("names the integration it stopped, never says the check failed, and tries again at the next start", async () => {
      const { seen, client } = await setupOpener(root, {
        fenceProof: { state: "not-fenced", reason: "the canary file was readable" },
      });
      const call = client().callTool("read-note", {});
      await expect(call).rejects.toThrow(
        "Connector \"notes\" didn't start: the sandbox didn't work when the integration notes started, so none of it ran. Halonic tries notes in the sandbox again the next time a run uses it.",
      );
      await expect(call).rejects.not.toThrow(/failed its check/);
      expect(seen.stops).toBe(1);
      await expect(client().callTool("read-note", {})).rejects.toThrow(
        /the sandbox didn't work when the integration notes started/,
      );
      expect(seen.starts).toBe(2);
    });
  });
});
