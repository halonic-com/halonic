import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import type { SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bridgePort,
  finish,
  makeFolders,
  makeJunction,
  profileOver,
  type RealMxc,
  realMxc,
  type TestFolders,
} from "./real-box.ts";

/**
 * Attacks against the real fence: a program that tries to get out the ways a
 * misbehaving agent would. Like `mxc-fence.test.ts`, these need Windows 11
 * where MXC is offered and run with `pnpm test:fence`.
 */
describe("a program trying to get out of the MXC fence", () => {
  let mxc: RealMxc;
  let folders: TestFolders;
  let session: SandboxSession;
  let listener: Server;
  let listenerPort: number;
  let reached = false;

  async function node(script: string, target: SandboxSession = session) {
    return finish(await target.start({ program: process.execPath, args: ["-e", script] }));
  }

  beforeAll(async () => {
    mxc = await realMxc();
    folders = await makeFolders(mxc.base);
    listener = createServer((socket) => {
      reached = true;
      socket.destroy();
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    listenerPort = (listener.address() as AddressInfo).port;
    session = await mxc.sandbox.open(profileOver(folders));
  });

  afterAll(async () => {
    await session?.close();
    listener?.close();
    await mxc?.remove();
  });

  it("can't connect to a port of this computer that isn't the bridge", async () => {
    const { exit } = await node(
      `const s = require('node:net').connect(${listenerPort}, '127.0.0.1');` +
        "s.setTimeout(5000, () => process.exit(9));" +
        "s.on('connect', () => process.exit(0)); s.on('error', () => process.exit(9));",
    );
    expect(exit.code).not.toBe(0);
    expect(reached).toBe(false);
  });

  /** Runs Node to read `path` and print it, ending with code 5 if it can't. */
  function readScript(path: string): string {
    return (
      `try { console.log(require('node:fs').readFileSync(${JSON.stringify(path)}, 'utf8')); }` +
      "catch { process.exit(5); }"
    );
  }

  // Raw strings, not `join`: `join` resolves `..`, so the program would get the plain path.
  const secretSpellings: Array<[string, (folders: TestFolders) => string]> = [
    ["a path that goes around it", (f) => `${f.secrets}\\..\\secrets\\key.txt`],
    ["another letter case", (f) => join(f.secrets, "key.txt").toUpperCase()],
    ["the long-path prefix", (f) => `\\\\?\\${f.secret}`],
    ["a trailing dot", (f) => `${f.secret}.`],
    ["its data stream", (f) => `${f.secret}::$DATA`],
  ];

  it.each(secretSpellings)("can't read a denied file by %s", async (_name, spell) => {
    const { out, exit } = await node(readScript(spell(folders)));
    expect(out).not.toContain("hunter2");
    expect(exit.code).not.toBe(0);
  });

  it("can't read a denied file through a junction it makes", async () => {
    const link = join(folders.work, "made-link");
    const { out, exit } = await node(
      `const fs = require('node:fs');` +
        `fs.symlinkSync(${JSON.stringify(folders.secrets)}, ${JSON.stringify(link)}, 'junction');` +
        readScript(join(link, "key.txt")),
    );
    expect(out).not.toContain("hunter2");
    expect(exit.code).not.toBe(0);
  });

  it("can't read a denied file through a junction made on the host before the session opens", async () => {
    // A cloned repository can hold such a link inside the working folder.
    const link = join(folders.work, "cloned-link");
    await makeJunction(folders.secrets, link);
    const fresh = await mxc.sandbox.open(profileOver(folders));
    try {
      const { out, exit } = await node(readScript(join(link, "key.txt")), fresh);
      expect(out).not.toContain("hunter2");
      expect(exit.code).not.toBe(0);
    } finally {
      await fresh.close();
    }
  });

  it("can't write where it only may read, with a path that climbs out of the working folder", async () => {
    const climbing = `${folders.work}\\..\\readonly\\new.txt`;
    const { exit } = await node(
      `require('node:fs').writeFileSync(${JSON.stringify(climbing)}, 'x')`,
    );
    expect(exit.code).not.toBe(0);
    await expect(stat(join(folders.readOnly, "new.txt"))).rejects.toThrow();
  });

  it("can't write a folder it has no grant for, with a path that climbs out of the working folder", async () => {
    // The host can write the folder (see `makeFolders`), so only the fence stops the program.
    const climbing = `${folders.work}\\..\\outside\\x.txt`;
    const { exit } = await node(
      `require('node:fs').writeFileSync(${JSON.stringify(climbing)}, 'x')`,
    );
    expect(exit.code).not.toBe(0);
    await expect(stat(join(folders.outside, "x.txt"))).rejects.toThrow();
  });

  it("doesn't see the environment of the process that runs Halonic", async () => {
    const name = "HALONIC_FENCE_TEST_HOST_SECRET";
    process.env[name] = "hunter3";
    try {
      const { out, exit } = await node("console.log(JSON.stringify(process.env))");
      expect(exit.code).toBe(0);
      expect(out).not.toContain("hunter3");
      expect(Object.keys(JSON.parse(out) as Record<string, string>)).not.toContain(name);
    } finally {
      delete process.env[name];
    }
  });

  it("records whether it can read a credential of the Windows Credential Manager (A36)", async () => {
    // A throwaway generic credential with a random value, made on the host and
    // always deleted. The boxed program logs only "read ok" or the error code,
    // never the value. This records the result; it doesn't judge it yet (HAL-9368).
    const target = "mxc-a36-canary";
    const value = randomBytes(16).toString("hex");
    // No Add-Type: the box has no PowerShell cmdlets for it, so the call is declared by reflection.
    const readCredential = [
      "$stage = 'declare'",
      "try {",
      "$builder = [AppDomain]::CurrentDomain.DefineDynamicAssembly([Reflection.AssemblyName]::new('canary'), 'Run')",
      "$type = $builder.DefineDynamicModule('canary').DefineType('Cred', 'Public,Class')",
      "$read = $type.DefinePInvokeMethod('CredReadW', 'advapi32.dll', 'Public,Static,PinvokeImpl', 'Standard', [bool], @([string], [int], [int], [IntPtr].MakeByRefType()), 'Winapi', 'Unicode')",
      "$read.SetImplementationFlags('PreserveSig')",
      "$last = $type.DefinePInvokeMethod('GetLastError', 'kernel32.dll', 'Public,Static,PinvokeImpl', 'Standard', [int], @(), 'Winapi', 'Unicode')",
      "$last.SetImplementationFlags('PreserveSig')",
      "$made = $type.CreateType()",
      "$stage = 'read'",
      `$arguments = [object[]]@('${target}', 1, 0, [IntPtr]::Zero)`,
      "if ($made.GetMethod('CredReadW').Invoke($null, $arguments)) { 'read ok' }",
      "else { 'read failed ' + $made.GetMethod('GetLastError').Invoke($null, @()) }",
      "} catch { 'script failed at ' + $stage + ': ' + $_.Exception.GetType().Name + ' ' + $_.Exception.Message.Substring(0, [Math]::Min(200, $_.Exception.Message.Length)) }",
      `'listed by cmdkey: ' + [bool]((cmdkey /list:${target} 2>&1 | Out-String) -match '${target}')`,
    ].join("\n");
    const encoded = Buffer.from(readCredential, "utf16le").toString("base64");
    execFileSync("cmdkey", [`/generic:${target}`, "/user:canary", `/pass:${value}`], {
      stdio: "ignore",
    });
    try {
      const { out, err, exit } = await finish(
        await session.start({
          program: "powershell.exe",
          args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        }),
      );
      // Control: the same script on the host must read it, or the box's "failed" proves nothing.
      const control = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { encoding: "utf8" },
      );
      console.log(`A36 canary host control: ${control.split("\n")[0]?.trim()}`);
      expect(out + err + control).not.toContain(value);
      console.log(`A36 canary: exit ${exit.code}, output: ${out.trim()}`);
      console.log(`A36 canary stderr (first 300 chars): ${err.trim().slice(0, 300)}`);
    } finally {
      execFileSync("cmdkey", [`/delete:${target}`], { stdio: "ignore" });
    }
  });

  it("leaves no program of its own running after kill, also one a program started", async () => {
    const beat = join(folders.work, "heartbeat.txt");
    const child = `const fs = require('node:fs'); setInterval(() => fs.appendFileSync(${JSON.stringify(beat)}, 'x'), 100);`;
    const parent =
      `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore' });` +
      "setInterval(() => {}, 1000);";
    const size = async () => (await stat(beat).catch(() => ({ size: 0 }))).size;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const started = await session.start({ program: process.execPath, args: ["-e", parent] });
    // The grandchild is alive: its heartbeat grows.
    const deadline = Date.now() + 15_000;
    while ((await size()) === 0 && Date.now() < deadline) await wait(200);
    expect(await size()).toBeGreaterThan(0);
    await started.kill();
    await started.exited;
    await wait(500);
    const after = await size();
    await wait(1000);
    expect(await size()).toBe(after);
  });

  it("is not fenced, and runs nothing, when the denied path holds Halonic's box folders", async () => {
    const trap = await mxc.sandbox.open(profileOver(folders, { deniedPaths: [mxc.dataFolder] }));
    try {
      expect(trap.fence.state).toBe("not-fenced");
      await expect(trap.start({ program: process.execPath, args: ["-v"] })).rejects.toThrow();
    } finally {
      await trap.close();
    }
  });

  it("refuses a profile with allowed sites, and runs nothing", async () => {
    await expect(
      mxc.sandbox.open(
        profileOver(folders, {
          network: {
            bridge: { kind: "loopback", host: "127.0.0.1", port: bridgePort },
            allowedSites: ["example.invalid"],
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
