import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { ControlFrameDecoder } from "./control-frames.ts";
import { engineCommand } from "./engine-command.ts";
import type { RunningEngine } from "./engine-role.ts";

/** A frame as the shell writes it: the length, then the JSON. */
function shellFrame(json: string): Buffer {
  const bytes = Buffer.from(json, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

const folders: string[] = [];

afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

/** An invented workspace without history, and an empty profile folder beside it. */
async function acmeFolders() {
  const root = await mkdtemp(join(tmpdir(), "halonic-engine-"));
  folders.push(root);
  const workspace = join(root, "acme");
  await mkdir(workspace);
  await writeFile(join(workspace, "workspace.yaml"), "id: acme\nname: Acme\n");
  return { workspace, profileFolder: join(root, "profile") };
}

/** Starts the engine command on pipes the test plays the shell on. */
function startEngine(args: readonly string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  const errors: string[] = [];
  const frames: Record<string, unknown>[] = [];
  const decoder = new ControlFrameDecoder();
  output.on("data", (chunk: Buffer) => {
    frames.push(...(decoder.push(chunk) as Record<string, unknown>[]));
  });
  const exit = engineCommand(args, "0.0.0-test", {
    input,
    writeError: (text) => errors.push(text),
    takeOutput: () => output,
  });
  /** Resolves with the first frame of `kind`, once the engine has sent it. */
  const frame = async (kind: string) => {
    for (;;) {
      const found = frames.find((each) => each["kind"] === kind);
      if (found !== undefined) return found;
      await new Promise((resolve) => output.once("data", resolve));
    }
  };
  return { input, exit, errors, frame };
}

verifies("agent-host.engine-role-arguments", () => {
  describe("engineCommand", () => {
    it("leaves a command line without --engine to the host", () => {
      const io = {
        input: new PassThrough(),
        writeError: () => {},
        takeOutput: () => new PassThrough(),
      };
      expect(engineCommand(["--stdio"], "0.0.0-test", io)).toBe(undefined);
    });

    it("refuses a relative workspace with code 2, before anything opens", async () => {
      const engine = startEngine(["--engine", "--profile-folder", tmpdir(), "--workspace", "acme"]);
      expect(await engine.exit).toBe(2);
      expect(engine.errors.join("")).toContain("absolute folders");
    });
  });
});

verifies("agent-host.engine-role-lifecycle", () => {
  describe("engineCommand on a workspace", () => {
    it("opens the engine, serves its API with the launch token, and stops on `stop`", async () => {
      const { workspace, profileFolder } = await acmeFolders();
      const engine = startEngine([
        "--engine",
        "--profile-folder",
        profileFolder,
        "--workspace",
        workspace,
      ]);
      const handshake = await engine.frame("handshake");
      const url = String(handshake["url"]);
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      const hello = await fetch(`${url}/api/hello`, {
        headers: { authorization: `Bearer ${String(handshake["token"])}` },
      });
      expect(hello.status).toBe(200);
      expect((await fetch(`${url}/api/hello`)).status).toBe(401);
      expect(await engine.frame("health")).toMatchObject({
        scheduling: true,
        paused: true,
        activeRuns: 0,
        runsWaiting: 0,
        nextRoutineAt: null,
      });
      engine.input.write(shellFrame('{"kind":"stop"}'));
      expect(await engine.exit).toBe(0);
      expect(await engine.frame("stopped")).toEqual({ kind: "stopped", interrupted: 0 });
      expect(engine.errors).toEqual([]);
    });
  });
});

verifies("agent-host.engine-role-lifecycle", () => {
  describe("engineCommand after a stop past the grace time", () => {
    it("ends the process once `stopped` is written, as a step still runs without the lock", async () => {
      const input = new PassThrough();
      const output = new PassThrough();
      const written: Buffer[] = [];
      output.on("data", (chunk: Buffer) => written.push(chunk));
      const exits: number[] = [];
      const abandoned: RunningEngine = {
        url: "http://127.0.0.1:49152",
        token: "a".repeat(43),
        health: () => ({
          scheduling: true,
          paused: false,
          activeRuns: 1,
          runsWaiting: 0,
          lastTick: null,
          nextRoutineAt: null,
        }),
        useSandboxHost: () => {},
        pauseRoutines: () => {},
        followHealth: () => () => {},
        stopScheduling: () => {},
        settle: async () => 1,
        close: async () => {},
      };
      const exit = engineCommand(
        ["--engine", "--profile-folder", resolve("acme-profile"), "--workspace", resolve("acme")],
        "0.0.0-test",
        {
          input,
          writeError: () => {},
          takeOutput: () => output,
          exit: (code) => exits.push(code),
        },
        (_args, _version, writeError) => ({
          open: async () => abandoned,
          every: () => () => {},
          writeError,
          abandoned: () => true,
        }),
      );
      input.write(shellFrame('{"kind":"stop"}'));
      expect(await exit).toBe(0);
      expect(exits).toEqual([0]);
      const frames = new ControlFrameDecoder().push(Buffer.concat(written));
      expect(frames.at(-1)).toEqual({ kind: "stopped", interrupted: 1 });
    });
  });
});
