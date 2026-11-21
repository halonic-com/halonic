import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { type Machine, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { secretsFile } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HostIo, run } from "./host.ts";
import { optionalProfileOf } from "./profile-folder.ts";
import { FakeKeychainShell } from "./secrets/fake-keychain-shell.test-helper.ts";
import { FrameKind } from "./stdio/frame-codec.ts";
import { TestRelay } from "./stdio/relay.test-helper.ts";
import { takeStandardOutput } from "./stdio/standard-output.ts";

const relayPort = 50_123;
// A made-up value: never a key anyone uses.
const savedKey = "made-up-remote-host-key";

/** A machine on which the sandbox is set up and nothing really runs. */
function sandboxHere(): SrtSandbox {
  const machine: Partial<Machine> = { platform: "linux" };
  return new SrtSandbox(machine as Machine);
}

let profileFolder = "";
let secretsFileStore: FileSecretStore;

beforeEach(async () => {
  profileFolder = await mkdtemp(join(tmpdir(), "halonic-host-keychain-"));
  const profile = optionalProfileOf(profileFolder);
  if (profile === undefined) throw new Error("No profile.");
  secretsFileStore = new FileSecretStore(secretsFile(profile));
  await secretsFileStore.set("remote-host-key", savedKey);
});

afterEach(async () => {
  await rm(profileFolder, { recursive: true, force: true });
});

/** Resolves once `check` holds, looking again after each turn of the event loop. */
async function eventually(check: () => boolean | Promise<boolean>): Promise<void> {
  while (!(await check())) await new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.keychain-secrets", () => {
  describe("run --keychain-relay", () => {
    it("moves the host's key out of the secrets file into the shell's keychain when it serves over frames", async () => {
      const relay = new TestRelay(true);
      const shell = new FakeKeychainShell((frame) => relay.send(frame));
      relay.onHostFrame = (frame) => shell.take(frame);
      const errors: string[] = [];
      const io: HostIo = {
        input: relay.streams.input,
        write: () => {
          throw new Error("--stdio writes only through the output it took over.");
        },
        writeError: (text) => errors.push(text),
        takeOutput: () => relay.streams.output,
      };
      const args = [
        "--stdio",
        "--relay-host",
        `127.0.0.1:${relayPort}`,
        "--keychain-relay",
        "--profile-folder",
        profileFolder,
      ];
      const running = run(args, "1.2.3", io, () => sandboxHere());
      await relay.handshakeLine();

      await eventually(async () => (await secretsFileStore.get("remote-host-key")) === null);
      expect(shell.stored.get("remote_host_key")).toBe(savedKey);
      expect(errors.join("")).toContain(
        "Moved remote-host-key from the secrets file to the keychain.",
      );
      expect(errors.join("")).not.toContain(savedKey);

      relay.streams.input.end();
      expect(await running).toBe(0);
    });

    it("moves it over standard input and output after the handshake when it serves on loopback, with stray prints on standard error", async () => {
      const relay = new TestRelay(true);
      const shell = new FakeKeychainShell((frame) => relay.send(frame));
      relay.onHostFrame = (frame) => shell.take(frame);
      const stdout = relay.streams.output;
      const stderr = new PassThrough();
      const io: HostIo = {
        input: relay.streams.input,
        write: (text) => stdout.write(text),
        writeError: () => {},
        takeOutput: () => takeStandardOutput(stdout, stderr),
      };
      const running = run(
        ["--keychain-relay", "--profile-folder", profileFolder],
        "1.2.3",
        io,
        () => sandboxHere(),
      );
      expect(Object.keys(JSON.parse(await relay.handshakeLine()) as object)).toEqual([
        "url",
        "token",
      ]);
      // A stray print after the handshake, as a library's console.log would make.
      stdout.write("a stray log line\n");

      await eventually(async () => (await secretsFileStore.get("remote-host-key")) === null);
      expect(shell.stored.get("remote_host_key")).toBe(savedKey);
      expect((stderr.read() as Buffer).toString()).toBe("a stray log line\n");

      relay.streams.input.end();
      expect(await running).toBe(0);
    });

    it("stops serving on loopback with 1 when the shell's frames break", async () => {
      const relay = new TestRelay(true);
      const errors: string[] = [];
      const io: HostIo = {
        input: relay.streams.input,
        write: (text) => relay.streams.output.write(text),
        writeError: (text) => errors.push(text),
        takeOutput: () => relay.streams.output,
      };
      const running = run(["--keychain-relay"], "1.2.3", io, () => sandboxHere());
      await relay.handshakeLine();
      relay.sendFrame(0, FrameKind.data, Buffer.from('{"ok":true,"value":null}'));
      expect(await running).toBe(1);
      expect(errors.join("")).toMatch(/without a request/);
    });

    it("stops over frames when the relay sends on id 0 to a host without the channel", async () => {
      const relay = new TestRelay(true);
      const errors: string[] = [];
      const io: HostIo = {
        input: relay.streams.input,
        write: () => {},
        writeError: (text) => errors.push(text),
        takeOutput: () => relay.streams.output,
      };
      const args = ["--stdio", "--relay-host", `127.0.0.1:${relayPort}`];
      const running = run(args, "1.2.3", io, () => sandboxHere());
      await relay.handshakeLine();
      relay.sendFrame(0, FrameKind.data, Buffer.from("{}"));
      expect(await running).toBe(1);
      expect(errors.join("")).toMatch(/Connection 0 was never opened/);
    });
  });
});
