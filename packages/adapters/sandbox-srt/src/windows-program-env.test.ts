import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sandboxRuntimeFolder } from "./srt-runner.ts";
import { makeProfile } from "./srt-session.test-helper.ts";
import { programEnv } from "./srt-session-env.ts";
import { copyJavaAgent, sessionToolEnv, windowsToolEnv } from "./windows-program-env.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-windows-env-test-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);
const online = (overrides: Partial<SandboxProfile> = {}) =>
  profile({
    network: { bridge: null, allowedSites: ["registry.npmjs.org"] },
    ...overrides,
  });
const offline = () => profile({ network: { bridge: null, allowedSites: [] } });
const agent = "C:/halonic/temp/srt-proxy-agent.jar";

verifies("sandbox-srt.windows-program-env", () => {
  describe("npm's cache", () => {
    it("is in the session's temp folder", () => {
      const p = online();
      expect(windowsToolEnv(p, agent)["npm_config_cache"]).toBe(join(p.tempFolder, "npm-cache"));
    });

    it("is the profile's when it names one, in any case", () => {
      const env = windowsToolEnv(online({ env: { NPM_CONFIG_CACHE: "D:/cache" } }), agent);
      expect(env).not.toHaveProperty("npm_config_cache");
    });
  });

  describe("on macOS and Linux", () => {
    it("adds nothing: srt sets Java's agent there itself", async () => {
      expect(await sessionToolEnv(online(), "linux")).toEqual({});
      expect(await sessionToolEnv(online(), "darwin")).toEqual({});
    });
  });

  describe("on Windows", () => {
    it("points Java at the copy in the temp folder", async () => {
      const p = online();
      await mkdir(p.tempFolder, { recursive: true });
      const env = await sessionToolEnv(p, "win32");
      expect(env["JAVA_TOOL_OPTIONS"]).toBe(
        `-javaagent:${join(p.tempFolder, "srt-proxy-agent.jar")}`,
      );
    });
  });

  describe("Java's proxy agent", () => {
    it("is set when the session reaches the network", () => {
      expect(windowsToolEnv(online(), agent)["JAVA_TOOL_OPTIONS"]).toBe(`-javaagent:${agent}`);
    });

    it("comes before the profile's own options", () => {
      const env = windowsToolEnv(online({ env: { java_tool_options: "-Xmx1g" } }), agent);
      expect(env["JAVA_TOOL_OPTIONS"]).toBe(`-javaagent:${agent} -Xmx1g`);
      // It replaces the profile's spelling: Windows reads names in any case.
      const all = programEnv(online({ env: { java_tool_options: "-Xmx1g" } }), {}, undefined, env);
      expect(all).not.toHaveProperty("java_tool_options");
      expect(all["JAVA_TOOL_OPTIONS"]).toBe(`-javaagent:${agent} -Xmx1g`);
    });

    it("is not set without a network, without a copy or on a path with a space", () => {
      expect(windowsToolEnv(offline(), agent)).not.toHaveProperty("JAVA_TOOL_OPTIONS");
      expect(windowsToolEnv(online(), null)).not.toHaveProperty("JAVA_TOOL_OPTIONS");
      expect(
        windowsToolEnv(online(), "C:/Program Files/halonic/srt-proxy-agent.jar"),
      ).not.toHaveProperty("JAVA_TOOL_OPTIONS");
    });
  });

  describe("the agent's copy", () => {
    it("is srt's shipped jar, in the temp folder", async () => {
      const copy = await copyJavaAgent(base);
      expect(copy).toBe(join(base, "srt-proxy-agent.jar"));
      const shipped = join(
        sandboxRuntimeFolder(),
        "vendor",
        "java-proxy-agent",
        "srt-proxy-agent.jar",
      );
      expect(await readFile(copy ?? "")).toEqual(await readFile(shipped));
    });

    it("never writes through a link left at its path", async () => {
      const victim = join(base, "victim");
      await writeFile(victim, "kept");
      const temp = await mkdtemp(join(base, "temp-"));
      await symlink(victim, join(temp, "srt-proxy-agent.jar"));
      const source = join(base, "agent.jar");
      await writeFile(source, "agent");
      expect(await copyJavaAgent(temp, source)).toBe(join(temp, "srt-proxy-agent.jar"));
      expect(await readFile(victim, "utf8")).toBe("kept");
      expect(await readFile(join(temp, "srt-proxy-agent.jar"), "utf8")).toBe("agent");
    });

    it("is null when srt ships no jar", async () => {
      expect(await copyJavaAgent(base, join(base, "missing.jar"))).toBeNull();
      expect(existsSync(join(base, "srt-proxy-agent.jar"))).toBe(false);
    });
  });
});
