import type { IntegrationTool, TokenStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { IntegrationDeclaration } from "../frames.ts";
import { fakeSecret } from "../pipes.test-helper.ts";
import type { RunnerConnection } from "./connect-runner.ts";
import type { FolderEntry, IntegrationFolderDisk } from "./integration-folder.ts";
import { type RunnerStop, RunnerStoppedError } from "./limits.ts";
import {
  type LoadLocalIntegrationOptions,
  type LocalRunnerBridge,
  loadLocalIntegration,
} from "./local-integration.ts";

/** The weather sheet as the build writes it. */
function sheet(): Record<string, unknown> {
  return {
    id: "weather",
    version: "1.0.0",
    kit: 1,
    provides: ["connector"],
    hosts: ["api.example.com"],
    secrets: {
      "weather-key": { purpose: "Reads the forecast.", hosts: ["api.example.com"], as: "bearer" },
    },
    tools: [
      {
        name: "forecast",
        description: "Today's forecast for a city.",
        arguments: { city: "The city." },
        risk: "read",
        untrusted: true,
      },
    ],
  };
}

function forecastTool(): IntegrationTool {
  return {
    name: "forecast",
    description: "Today's forecast for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "The city." } },
      required: ["city"],
    },
    risk: "read",
    untrusted: true,
  };
}

function declaration(tools: IntegrationTool[] = [forecastTool()]): IntegrationDeclaration {
  return { name: "weather", version: "1.0.0", tools };
}

/** A started runner the test stops by hand. */
interface FakeRunner extends RunnerConnection {
  stop(stop: RunnerStop): void;
  /** Refuses calls with `stop` while `stopped` hasn't settled yet, as while its process is killed. */
  stopping(stop: RunnerStop): void;
  readonly closed: () => boolean;
}

function fakeRunner(declared: IntegrationDeclaration, answer: string): FakeRunner {
  let stopWith: (stop: RunnerStop) => void = () => undefined;
  const stopped = new Promise<RunnerStop>((resolve) => {
    stopWith = resolve;
  });
  let stop: RunnerStop | undefined;
  let closed = false;
  const end = (reason: RunnerStop) => {
    stop ??= reason;
    stopWith(stop);
  };
  return {
    declaration: declared,
    stopped,
    callTool: async (name, args) => {
      if (stop !== undefined) throw new RunnerStoppedError(stop);
      return `${answer}: ${name} ${JSON.stringify(args)}`;
    },
    close: async () => {
      closed = true;
      end({ reason: "closed" });
    },
    stop: end,
    stopping: (reason) => {
      stop ??= reason;
    },
    closed: () => closed,
  };
}

/** A disk holding only what the test lists, by folder; links lead where `links` says. */
function fakeDisk(
  folders: Record<string, FolderEntry[]>,
  links: Record<string, string> = {},
): IntegrationFolderDisk {
  return {
    entries: (folder) => {
      const entries = folders[folder];
      if (entries === undefined) throw new Error(`no folder ${folder}`);
      return entries;
    },
    realPath: (path) => {
      if (path in folders) return path;
      const target = links[path];
      if (target === undefined) throw new Error(`no such path ${path}`);
      return target;
    },
    identity: (file) => ({ id: file, names: 1 }),
  };
}

const tidyFolder = fakeDisk(
  {
    "/work/weather": [
      { name: "index.js", kind: "file" },
      { name: "node_modules", kind: "folder" },
    ],
    "/work/weather/node_modules": [{ name: "zod", kind: "link" }],
    "/work/weather/node_modules/.pnpm/zod": [],
  },
  { "/work/weather/node_modules/zod": "/work/weather/node_modules/.pnpm/zod" },
);

function memoryTokens(): TokenStore {
  const values = new Map<string, string>();
  return {
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
  };
}

/** Loads with runners that answer in turn from `runners`, recording each start. */
async function load(runners: FakeRunner[], overrides: Partial<LoadLocalIntegrationOptions> = {}) {
  const starts: LocalRunnerBridge[] = [];
  const queue = [...runners];
  const loaded = await loadLocalIntegration({
    sheet: sheet(),
    approvedSheet: sheet(),
    folder: "/work/weather",
    folderDisk: tidyFolder,
    choices: { secretNames: { "weather-key": "example-key" } },
    transport: { fetch: async () => new Response("{}") },
    secrets: { get: async (name) => (name === "example-key" ? fakeSecret : null) },
    tokens: memoryTokens(),
    start: async (bridge) => {
      starts.push(bridge);
      const next = queue.shift();
      if (next === undefined) throw new Error("no runner left to start");
      return next;
    },
    ...overrides,
  });
  return { loaded, starts };
}

verifies("integration-runner.local-integration", () => {
  describe("loading", () => {
    it("starts one runner with the host's client, the sheet's tools and the secrets' forms, and offers what it declared", async () => {
      const runner = fakeRunner(declaration(), "first");
      const { loaded, starts } = await load([runner]);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      const { integration, host } = loaded.value;
      expect(integration.tools).toEqual([forecastTool()]);
      expect(starts).toHaveLength(1);
      expect(starts[0]?.http).toBe(host.http);
      expect(starts[0]?.tools).toEqual(["forecast"]);
      expect(starts[0]?.secrets.texts).toContain(`Bearer ${fakeSecret}`);
      const connection = integration.connect(host);
      expect(await connection.callTool("forecast", { city: "Ghent" })).toBe(
        'first: forecast {"city":"Ghent"}',
      );
      expect(starts).toHaveLength(1);
      await connection.close();
      expect(runner.closed()).toBe(true);
    });

    it("starts nothing when the sheet is refused, such as one with tokens", async () => {
      const withTokens = { ...sheet(), tokens: [{ name: "refresh", purpose: "Stays signed in." }] };
      const { loaded, starts } = await load([], { sheet: withTokens, approvedSheet: withTokens });
      expect(loaded.ok ? [] : loaded.error.map((problem) => problem.code)).toEqual([
        "tokens-not-allowed",
      ]);
      expect(starts).toEqual([]);
    });

    it("starts nothing when a link in the folder leads out of it, or nowhere (A12)", async () => {
      const disk = fakeDisk(
        {
          "/work/weather": [
            { name: "keys", kind: "link" },
            { name: "gone", kind: "link" },
          ],
        },
        { "/work/weather/keys": "/work/elsewhere/.ssh" },
      );
      const { loaded, starts } = await load([], { folderDisk: disk });
      expect(loaded.ok ? [] : loaded.error.map(({ code, message }) => ({ code, message }))).toEqual(
        [
          {
            code: "link-out-of-folder",
            message: "weather: its folder holds a link out of it, keys",
          },
          {
            code: "link-out-of-folder",
            message: "weather: its folder holds a link out of it, gone",
          },
        ],
      );
      expect(starts).toEqual([]);
    });

    it("stops the runner and offers nothing when the code declares other than the sheet", async () => {
      const runner = fakeRunner(declaration([{ ...forecastTool(), risk: "write" }]), "first");
      const { loaded } = await load([runner]);
      expect(loaded.ok ? [] : loaded.error.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: "tool-differs", path: ["tools", 0, "risk"] },
      ]);
      expect(runner.closed()).toBe(true);
    });

    it("passes on what start throws, such as an untrusted workspace", async () => {
      const untrusted = new Error("the workspace isn't trusted");
      await expect(
        load([], {
          start: async () => {
            throw untrusted;
          },
        }),
      ).rejects.toBe(untrusted);
    });

    it("closes the shared runner only when the last connection closes", async () => {
      const runner = fakeRunner(declaration(), "first");
      let answer: () => void = () => undefined;
      const answered = new Promise<void>((resolve) => {
        answer = resolve;
      });
      const slowRunner: FakeRunner = {
        ...runner,
        callTool: async (name, args, signal) => {
          await answered;
          return runner.callTool(name, args, signal);
        },
      };
      const { loaded, starts } = await load([slowRunner]);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      const { integration, host } = loaded.value;
      const leaving = integration.connect(host);
      const staying = integration.connect(host);

      const inFlight = staying.callTool("forecast", { city: "Ghent" });
      await leaving.close();
      expect(runner.closed()).toBe(false);
      answer();
      expect(await inFlight).toBe('first: forecast {"city":"Ghent"}');
      await expect(leaving.callTool("forecast", {})).rejects.toThrow(
        "weather: its connection is closed",
      );

      await staying.close();
      expect(runner.closed()).toBe(true);
      expect(starts).toHaveLength(1);
    });

    it("connects only through the host its loader built", async () => {
      const { loaded } = await load([fakeRunner(declaration(), "first")]);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      expect(() => loaded.value.integration.connect({ ...loaded.value.host })).toThrow(
        /only through the host its loader built/,
      );
    });
  });

  describe("after the runner stopped", () => {
    async function connected(runners: FakeRunner[]) {
      const { loaded, starts } = await load(runners);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      return { connection: loaded.value.integration.connect(loaded.value.host), starts };
    }

    it("starts a new runner on the next call after an idle stop", async () => {
      const first = fakeRunner(declaration(), "first");
      const { connection, starts } = await connected([first, fakeRunner(declaration(), "second")]);
      first.stop({ reason: "idle" });
      await first.stopped;
      expect(await connection.callTool("forecast", {})).toBe("second: forecast {}");
      expect(starts).toHaveLength(2);
    });

    it("starts nothing more after any other stop, and the call fails with its reason", async () => {
      const first = fakeRunner(declaration(), "first");
      const { connection, starts } = await connected([first, fakeRunner(declaration(), "second")]);
      first.stop({ reason: "protocol", detail: "a frame outside the protocol" });
      await first.stopped;
      await expect(connection.callTool("forecast", {})).rejects.toMatchObject({
        stop: { reason: "protocol" },
      });
      expect(starts).toHaveLength(1);
    });

    it("refuses a new runner whose code declares something else, and every later call fails with that", async () => {
      const first = fakeRunner(declaration(), "first");
      const changed = fakeRunner(
        declaration([{ ...forecastTool(), parameters: { type: "object" } }]),
        "changed",
      );
      const { connection, starts } = await connected([first, changed]);
      first.stop({ reason: "idle" });
      await first.stopped;
      await expect(connection.callTool("forecast", {})).rejects.toThrow(
        /declares something else than when it was loaded/,
      );
      expect(changed.closed()).toBe(true);
      await expect(connection.callTool("forecast", {})).rejects.toThrow(
        /declares something else than when it was loaded/,
      );
      expect(starts).toHaveLength(2);
    });

    it("checks the folder's links again before a new runner starts, and starts no more when one leads out (A12)", async () => {
      const folders: Record<string, FolderEntry[]> = { "/work/weather": [] };
      const first = fakeRunner(declaration(), "first");
      const { loaded, starts } = await load([first, fakeRunner(declaration(), "second")], {
        folderDisk: fakeDisk(folders, { "/work/weather/keys": "/work/elsewhere/.ssh" }),
      });
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      const connection = loaded.value.integration.connect(loaded.value.host);
      folders["/work/weather"] = [{ name: "keys", kind: "link" }];
      first.stop({ reason: "idle" });
      await first.stopped;
      await expect(connection.callTool("forecast", {})).rejects.toThrow(
        "weather: its folder holds a link out of it, keys",
      );
      folders["/work/weather"] = [];
      await expect(connection.callTool("forecast", {})).rejects.toThrow(/a link out of it, keys/);
      expect(starts).toHaveLength(1);
    });

    it("makes a call once more on a new runner when the one it got stopped for being idle", async () => {
      const first = fakeRunner(declaration(), "first");
      const { connection, starts } = await connected([first, fakeRunner(declaration(), "second")]);
      first.stopping({ reason: "idle" });
      expect(await connection.callTool("forecast", {})).toBe("second: forecast {}");
      expect(starts).toHaveLength(2);
    });

    it("refuses calls on a closed connection and starts no runner for them", async () => {
      const first = fakeRunner(declaration(), "first");
      const { loaded, starts } = await load([first, fakeRunner(declaration(), "second")]);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      const closing = loaded.value.integration.connect(loaded.value.host);
      const other = loaded.value.integration.connect(loaded.value.host);
      await closing.close();
      await expect(closing.callTool("forecast", {})).rejects.toThrow(
        "weather: its connection is closed",
      );
      expect(starts).toHaveLength(1);
      expect(await other.callTool("forecast", {})).toBe("first: forecast {}");
      expect(starts).toHaveLength(1);
    });
  });
});
