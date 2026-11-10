import { existsSync, readdirSync, readFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import type { StdioTransport } from "@halonicjs/app";
import type { ConnectorPin, HttpClient } from "@halonicjs/ports";
import { err, ok } from "@halonicjs/std";
import { RecordedRegistryClient } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { emptyNpmrc, nodeLaunchFolders } from "./launch-folders.ts";
import { checkPinnedLaunch, pinnedLaunch } from "./pinned-launch.ts";
import { registryTimeoutMs } from "./registry-lookup.ts";

const npmPin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org/",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

const pypiPin: ConnectorPin = {
  ...npmPin,
  registry: "pypi",
  registryUrl: "https://pypi.org",
  package: "mail-mcp",
};

function npx(pin: ConnectorPin | null = npmPin): StdioTransport {
  return {
    kind: "stdio",
    command: "npx",
    args: ["-y", "@acme/mail-mcp"],
    env: {},
    ...(pin === null ? {} : { pin }),
  };
}

const uvx: StdioTransport = {
  kind: "stdio",
  command: "uvx",
  args: ["mail-mcp"],
  env: {},
  pin: pypiPin,
};

/** A registry that answers every request with `response`. */
function answering(response: () => Response): HttpClient {
  return { fetch: async () => response() };
}

verifies("mcp.pinned-launcher", () => {
  describe("checking a launch", () => {
    it("passes a pin the registry lists, asking only under its address, once", async () => {
      const registry = new RecordedRegistryClient();
      expect(await checkPinnedLaunch(npx(), {}, registry)).toEqual(ok(npmPin));
      expect(registry.asked()).toEqual(["https://registry.npmjs.org/@acme%2fmail-mcp"]);
      const pypi = new RecordedRegistryClient();
      expect(await checkPinnedLaunch(uvx, {}, pypi)).toEqual(ok(pypiPin));
      expect(pypi.asked()).toEqual(["https://pypi.org/pypi/mail-mcp/2.3.1/json"]);
    });

    it("passes a program without a pin without asking any registry", async () => {
      const registry = new RecordedRegistryClient();
      expect(await checkPinnedLaunch(npx(null), { NODE_OPTIONS: "x" }, registry)).toEqual(ok(null));
      expect(registry.asked()).toEqual([]);
    });

    it("refuses a variable that secretEnv sets as if the connector's env set it, before asking", async () => {
      const registry = new RecordedRegistryClient();
      const checked = await checkPinnedLaunch(
        npx(),
        { npm_config_registry: "mail-registry" },
        registry,
      );
      expect(checked.ok).toBe(false);
      expect(checked.ok ? "" : checked.error).toContain("npm_config_registry");
      expect(registry.asked()).toEqual([]);
    });

    it("refuses an answer that isn't JSON, or isn't a package document, by reason", async () => {
      const html = answering(() => new Response("<html>"));
      expect(await checkPinnedLaunch(npx(), {}, html)).toEqual(
        err(
          "https://registry.npmjs.org/ answered with something other than JSON for @acme/mail-mcp",
        ),
      );
      for (const body of [null, { name: "@acme/mail-mcp", versions: null }, { info: {} }]) {
        const odd = answering(() => Response.json(body));
        for (const transport of [npx(), uvx]) {
          const checked = await checkPinnedLaunch(transport, {}, odd);
          expect(checked.ok ? "" : checked.error).toContain("doesn't list");
        }
      }
    });

    it("says a registry doesn't list the pin only for a 404, and names any other failing status", async () => {
      const missing = answering(() => new Response("", { status: 404 }));
      expect(await checkPinnedLaunch(npx(), {}, missing)).toEqual(
        err("https://registry.npmjs.org/ doesn't list @acme/mail-mcp 2.3.1"),
      );
      for (const status of [429, 503]) {
        const failing = answering(() => new Response("", { status }));
        expect(await checkPinnedLaunch(uvx, {}, failing)).toEqual(
          err(
            `https://pypi.org answered ${status} when asked for mail-mcp 2.3.1, so the version can't be checked`,
          ),
        );
      }
    });

    it("asks for JSON with a time limit, and refuses an unreachable registry", async () => {
      const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
        throw new TypeError("fetch failed");
      });
      const timeout = vi.spyOn(AbortSignal, "timeout");
      expect(await checkPinnedLaunch(npx(), {}, { fetch })).toEqual(
        err("https://registry.npmjs.org/ can't be reached to look up @acme/mail-mcp 2.3.1"),
      );
      expect(timeout).toHaveBeenCalledWith(registryTimeoutMs);
      expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ accept: "application/json" });
      timeout.mockRestore();
    });
  });

  describe("what a pinned program starts with", () => {
    const inherited = {
      PATH: "/usr/bin",
      Home: "/acme/home",
      TEMP: "/acme/home/tmp",
      HTTPS_PROXY: "http://proxy.acme.test:3128",
      LD_PRELOAD: "/opt/acme/lib.so",
      NODE_OPTIONS: "--require ./acme.js",
      npm_config_cache: "/acme/home/.npm",
      UV_INDEX_URL: "https://uv.acme.test/simple",
    };

    it("starts the runner at the pin's version, in the launch folder, with the registry set", () => {
      const launch = pinnedLaunch(
        { ...npx(), env: { MAIL_MODE: "quiet" } },
        npmPin,
        inherited,
        "/acme/launch-1",
      );
      expect(launch).toEqual({
        program: "npx",
        args: ["-y", "@acme/mail-mcp@2.3.1"],
        cwd: "/acme/launch-1",
        env: {
          PATH: "/usr/bin",
          HTTPS_PROXY: "http://proxy.acme.test:3128",
          LD_PRELOAD: "/opt/acme/lib.so",
          MAIL_MODE: "quiet",
          HOME: "/acme/launch-1",
          USERPROFILE: "/acme/launch-1",
          APPDATA: "/acme/launch-1",
          LOCALAPPDATA: "/acme/launch-1",
          XDG_CONFIG_HOME: "/acme/launch-1",
          XDG_CACHE_HOME: "/acme/launch-1",
          XDG_DATA_HOME: "/acme/launch-1",
          TMPDIR: "/acme/launch-1",
          TEMP: "/acme/launch-1",
          TMP: "/acme/launch-1",
          npm_config_registry: "https://registry.npmjs.org",
          npm_config_userconfig: join("/acme/launch-1", emptyNpmrc),
          npm_config_globalconfig: join("/acme/launch-1", emptyNpmrc),
        },
      });
    });

    it("points a PyPI runner's index at the registry's simple API, with no other config and no Python download", () => {
      const { env, args } = pinnedLaunch(uvx, pypiPin, inherited, "/acme/launch-2");
      expect(args).toEqual(["mail-mcp@2.3.1"]);
      expect(env).toMatchObject({
        UV_DEFAULT_INDEX: "https://pypi.org/simple",
        UV_NO_CONFIG: "1",
        UV_PYTHON_DOWNLOADS: "never",
        PIP_INDEX_URL: "https://pypi.org/simple",
        PIP_CONFIG_FILE: devNull,
      });
      expect(env).not.toHaveProperty("UV_INDEX_URL");
    });
  });

  it("creates each launch folder in the system's temporary folder as its own npm project, and deletes it", async () => {
    const first = await nodeLaunchFolders.create();
    const second = await nodeLaunchFolders.create();
    try {
      expect(first.startsWith(tmpdir())).toBe(true);
      expect(first).not.toBe(second);
      expect(readdirSync(first).sort()).toEqual([emptyNpmrc, "package.json"]);
      expect(readFileSync(join(first, "package.json"), "utf8")).toBe("{}\n");
      expect(readFileSync(join(first, emptyNpmrc), "utf8")).toBe("");
    } finally {
      await nodeLaunchFolders.remove(first);
      await nodeLaunchFolders.remove(second);
    }
    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
  });
});
