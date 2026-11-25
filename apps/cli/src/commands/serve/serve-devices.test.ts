import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { PasswordHasher } from "@halonicjs/ports";
import { ConsoleNotRunningError, ConsoleSocketError } from "@halonicjs/target-node-runtime";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { serveCommandWith } from "./command.ts";
import type { ConsoleTransport } from "./serve-console.ts";

/** The first start opens the engine and the listener from cold imports. */
const slowStart = { timeout: 10_000 };

/** A test that starts `halonic serve`: the first start opens it from cold imports. */
const slowTest = 30_000;

const password = "correct horse";

/** A hasher whose hash is readable, so a test can set the password's hash in the secrets. */
const hasher: PasswordHasher = {
  hash: async (typed) => `hash:${typed}`,
  verify: async (typed, hash) => hash === `hash:${typed}`,
  needsRehash: () => false,
};

/**
 * The console channel in memory, by socket path, so these tests run on every system; the Unix
 * socket itself is tested in `@halonicjs/target-node-runtime` (`runtime.console-socket`).
 * Requests and replies go through JSON, as they do on the socket.
 */
function memoryConsole(): ConsoleTransport {
  const open = new Map<string, (request: unknown) => Promise<unknown>>();
  return {
    async listen(place, answer) {
      open.set(place, answer);
      return { close: async () => void open.delete(place) };
    },
    async call(place, request) {
      const answer = open.get(place);
      if (answer === undefined) throw new ConsoleNotRunningError();
      return JSON.parse(JSON.stringify(await answer(JSON.parse(JSON.stringify(request)))));
    },
  };
}

let acmeRuns: AcmeRuns;
let transport: ConsoleTransport;
let secrets: MemorySecrets;
let running:
  | {
      signals: ReturnType<typeof fakeSignals>;
      serving: Promise<number>;
      io: ReturnType<typeof captureIo>;
    }
  | undefined;

// This Acme reaches only the test model, so it needs no trust.
beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-devices");
  transport = memoryConsole();
  secrets = new MemorySecrets({ "serve-password": `hash:${password}` });
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

const command = () => serveCommandWith({ ...acmeRunsSetup(acmeRuns), hasher, console: transport });

/** Starts `halonic serve` and gives its address. */
async function startServe(): Promise<string> {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const serving = runCli(["serve", "--port", "0"], io, [command()], {
    secrets,
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving, io };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowStart);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout[0])}.`);
  return found[1];
}

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
function terminalTyping(answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written: () => written.join("") };
}

/** Starts `halonic serve <args>` on the same computer, answering its questions with `answers`. */
function startCommand(args: string[], answers: string[] = []) {
  const io = captureIo(acmeRuns.acme);
  const typing = terminalTyping(answers);
  const done = runCli(["serve", ...args], io, [command()], { secrets, terminal: typing.terminal });
  return { io, done, asked: typing.written };
}

async function post(address: string, path: string, body: object, auth?: string) {
  const response = await fetch(`${address}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth === undefined ? {} : { authorization: auth }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => null)) as Answer };
}

interface Answer {
  readonly code?: string;
  readonly pendingId?: string;
  readonly checkCode?: string;
  readonly token?: string;
}

const signedIn = async (address: string, auth: string) =>
  (await fetch(`${address}/api/session`, { headers: { authorization: auth } })).status;

/** Pairs `name` with `halonic serve pair`, answering Allow with yes; gives its bearer header. */
async function pairFromConsole(address: string, name: string): Promise<string> {
  const pair = startCommand(["pair"], ["y"]);
  await waitUntil("the code", () => pair.io.stdout.length >= 1, slowStart);
  const code = /Pairing code: (\S+)$/u.exec(pair.io.stdout[0] ?? "")?.[1] ?? "";
  const pending = await post(address, "/api/pair", { code, deviceName: name });
  expect(await pair.done).toBe(0);
  const collected = await post(address, "/api/pair/status", { pendingId: pending.json.pendingId });
  return `Bearer ${collected.json.token}`;
}

/** Pairs `name` from a paired device's session, with the password, as a paired phone does. */
async function pairFromDevice(address: string, name: string, by: string): Promise<void> {
  const code = await post(address, "/api/devices/code", { password }, by);
  const pending = await post(address, "/api/pair", { code: code.json.code, deviceName: name });
  const listed = await fetch(`${address}/api/devices`, { headers: { authorization: by } });
  const { waiting } = (await listed.json()) as { waiting: { id: string }[] };
  await post(address, "/api/devices/allow", { password, requestId: waiting[0]?.id }, by);
  await post(address, "/api/pair/status", { pendingId: pending.json.pendingId });
}

/** The id at the end of a device's line in `halonic serve devices`. */
async function idOf(name: string): Promise<string> {
  const list = startCommand(["devices"]);
  expect(await list.done).toBe(0);
  const line = list.io.stdout.find((each) => each.startsWith(`${name} ·`)) ?? "";
  return /(device_[0-9a-f]{24})$/u.exec(line)?.[1] ?? "";
}

verifies("cli.commands.serve.pair", () => {
  it(
    "prints a code the pair route takes, and Allow gives the device its token once",
    async () => {
      const address = await startServe();
      const pair = startCommand(["pair"], ["y"]);
      await waitUntil("the code", () => pair.io.stdout.length >= 1, slowStart);
      expect(pair.io.stdout[0]).toMatch(/^Pairing code: [0-9A-Z]{4}-[0-9A-Z]{4}$/u);
      const code = pair.io.stdout[0]?.slice("Pairing code: ".length) ?? "";

      const pending = await post(address, "/api/pair", { code, deviceName: "Pixel 9" });
      expect(pending.status).toBe(200);
      expect(await pair.done).toBe(0);
      expect(pair.asked()).toContain(`Its check code is ${pending.json.checkCode}`);
      expect(pair.asked()).toContain("Allow Pixel 9?");
      expect(pair.io.stdout.at(-1)).toBe("✓ Pixel 9 is paired.");

      const first = await post(address, "/api/pair/status", { pendingId: pending.json.pendingId });
      expect(first.json.token).toMatch(/^[0-9a-f]{64}$/u);
      expect(await signedIn(address, `Bearer ${first.json.token}`)).toBe(200);
      const again = await post(address, "/api/pair/status", { pendingId: pending.json.pendingId });
      expect(again.status).toBe(404);
    },
    slowTest,
  );

  it(
    "allows nothing when the answer is no",
    async () => {
      const address = await startServe();
      const pair = startCommand(["pair"], ["n"]);
      await waitUntil("the code", () => pair.io.stdout.length >= 1, slowStart);
      const code = pair.io.stdout[0]?.slice("Pairing code: ".length) ?? "";
      const pending = await post(address, "/api/pair", { code, deviceName: "Pixel 9" });

      expect(await pair.done).toBe(1);
      expect(pair.io.stdout.at(-1)).toContain("Pixel 9 wasn't allowed.");
      const status = await post(address, "/api/pair/status", { pendingId: pending.json.pendingId });
      expect(status.status).toBe(202);
    },
    slowTest,
  );

  it(
    "never offers a request made with another code",
    async () => {
      const address = await startServe();
      const deviceA = await pairFromConsole(address, "Device A");
      // A request waiting on a code Device A made, as Studio's "Add a device" makes one.
      const other = await post(address, "/api/devices/code", { password }, deviceA);
      await post(address, "/api/pair", { code: other.json.code, deviceName: "Other phone" });

      await pairFromConsole(address, "Pixel 9");

      expect(await idOf("Pixel 9")).toMatch(/^device_/u);
      expect(await idOf("Other phone")).toBe("");
    },
    slowTest,
  );

  it(
    "still serves when the console can't open, and says pairing won't work and why",
    async () => {
      transport = {
        ...memoryConsole(),
        listen: async (place) => {
          throw new ConsoleSocketError("path-too-long", place);
        },
      };
      const address = await startServe();

      expect((await fetch(`${address}/api/hello`)).status).toBe(200);
      await waitUntil("the warning", () => (running?.io.stderr.length ?? 0) >= 1, slowStart);
      expect(running?.io.stderr).toContain(
        "! halonic serve pair and halonic serve devices won't work: the path to your Halonic profile folder is too long.",
      );
    },
    slowTest,
  );

  it(
    "still serves when the system won't let it make the console's folder, and says why",
    async () => {
      transport = {
        ...memoryConsole(),
        listen: async (place) => {
          throw Object.assign(new Error(`EACCES: permission denied, mkdir '${place}'`), {
            code: "EACCES",
          });
        },
      };
      const address = await startServe();

      expect((await fetch(`${address}/api/hello`)).status).toBe(200);
      await waitUntil("the warning", () => (running?.io.stderr.length ?? 0) >= 1, slowStart);
      expect(running?.io.stderr).toContainEqual(
        expect.stringMatching(
          /^! halonic serve pair and halonic serve devices won't work: EACCES: permission denied, mkdir /u,
        ),
      );
    },
    slowTest,
  );

  it("with no serve-password set, says to set it first", async () => {
    secrets = new MemorySecrets({});
    const pair = startCommand(["pair"]);

    expect(await pair.done).toBe(2);
    expect(pair.io.stderr.join("\n")).toContain(
      "no sign-in password is set, so no device can pair.",
    );
    expect(pair.io.stderr.join("\n")).toContain(
      "Set one first with: halonic secret set serve-password",
    );
  });

  it("says when no serve is running for the workspace", async () => {
    const pair = startCommand(["pair"]);

    expect(await pair.done).not.toBe(0);
    expect(pair.io.stderr.join("\n")).toContain("halonic serve isn't running for this workspace.");
  });
});

verifies("cli.commands.serve.devices", () => {
  it(
    "lists a paired device with when it was last seen and that this computer allowed it",
    async () => {
      const address = await startServe();
      await pairFromConsole(address, "Pixel 9");

      const list = startCommand(["devices"]);
      expect(await list.done).toBe(0);
      expect(list.io.stdout).toEqual([
        expect.stringMatching(
          /^Pixel 9 · last seen \d{1,2} \w{3} · allowed by this computer · device_[0-9a-f]{24}$/u,
        ),
      ]);
    },
    slowTest,
  );

  it(
    "says when no device is paired",
    async () => {
      await startServe();
      const list = startCommand(["devices"]);

      expect(await list.done).toBe(0);
      expect(list.io.stdout).toEqual(["No devices are paired. Add one with: halonic serve pair"]);
    },
    slowTest,
  );

  it(
    "revokes device A only, names the devices it allowed, and leaves them on a no",
    async () => {
      const address = await startServe();
      const deviceA = await pairFromConsole(address, "Device A");
      const deviceB = await pairFromConsole(address, "Device B");
      await pairFromDevice(address, "Device C", deviceA);
      const idOfA = await idOf("Device A");
      const idOfC = await idOf("Device C");

      const revoke = startCommand(["devices", "--revoke", idOfA], ["n"]);
      expect(await revoke.done).toBe(0);

      expect(revoke.asked()).toContain("Device A allowed these devices:");
      expect(revoke.asked()).toContain(`Device C · ${idOfC}`);
      expect(revoke.io.stdout[0]).toBe("✓ Device A is signed out.");
      expect(revoke.io.stdout.join("\n")).toContain("The device it allowed stays signed in.");
      expect(await signedIn(address, deviceA)).toBe(401);
      expect(await signedIn(address, deviceB)).toBe(200);
      expect(await idOf("Device C")).toBe(idOfC);
    },
    slowTest,
  );

  it(
    "signs out the devices it allowed too on a yes",
    async () => {
      const address = await startServe();
      const deviceA = await pairFromConsole(address, "Device A");
      await pairFromDevice(address, "Device C", deviceA);
      const idOfA = await idOf("Device A");

      const revoke = startCommand(["devices", "--revoke", idOfA, "--yes"]);
      expect(await revoke.done).toBe(0);

      expect(revoke.io.stdout).toEqual(["✓ Device A is signed out.", "✓ Device C is signed out."]);
      const list = startCommand(["devices"]);
      await list.done;
      expect(list.io.stdout).toEqual(["No devices are paired. Add one with: halonic serve pair"]);
    },
    slowTest,
  );

  it(
    "refuses an id no paired device has",
    async () => {
      await startServe();
      const revoke = startCommand(["devices", "--revoke", `device_${"0".repeat(24)}`]);

      expect(await revoke.done).toBe(4);
      expect(revoke.io.stderr.join("\n")).toContain(
        `There's no paired device with the id device_${"0".repeat(24)}.`,
      );
      expect(revoke.io.stderr.join("\n")).toContain(
        "See the paired devices with: halonic serve devices",
      );
    },
    slowTest,
  );
});

verifies("server.paperclip-key-password", () => {
  it(
    "shows who connected or disconnected a Paperclip key and when, by device id",
    async () => {
      // The server's record, as its console answers it once a sign-in stored a key and a
      // browser removed it; `server.paperclip-key-password` tests that the routes write it.
      const inner = memoryConsole();
      transport = {
        listen: inner.listen,
        async call(place, request) {
          const reply = (await inner.call(place, request)) as { devices?: { id: string }[] };
          const by = reply.devices?.[0]?.id ?? "";
          return {
            ...reply,
            keyChanges: [
              { connection: "halonic", change: "connected", by, at: "2026-11-25T10:31:00Z" },
              {
                connection: "halonic",
                change: "disconnected",
                by: "browser",
                at: "2026-11-25T11:02:00Z",
              },
            ],
          };
        },
      };
      const address = await startServe();
      await pairFromConsole(address, "Laptop");
      const idOfLaptop = await idOf("Laptop");

      const list = startCommand(["devices"]);
      expect(await list.done).toBe(0);

      expect(list.io.stdout.slice(1)).toEqual([
        expect.stringMatching(
          new RegExp(
            `^Paperclip key for halonic connected · 25 Nov \\d\\d:\\d\\d · by Laptop \\(${idOfLaptop}\\)$`,
            "u",
          ),
        ),
        expect.stringMatching(
          /^Paperclip key for halonic disconnected · 25 Nov \d\d:\d\d · by a browser$/u,
        ),
      ]);
    },
    slowTest,
  );
});
