import { execFile, spawnSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  leakProbeScript,
  parseLeakReport,
  parseWorkReport,
  workProbeScript,
} from "./probe-scripts.ts";

const execFileAsync = promisify(execFile);

/** Runs a probe script with this machine's Node, on real folders: there is no fence here, so it shows how the script reports. */
function run(script: string, folder: string, settings: unknown): string {
  const scriptFile = join(folder, "probe.cjs");
  const settingsFile = join(folder, "probe.json");
  writeFileSync(scriptFile, script);
  writeFileSync(settingsFile, JSON.stringify(settings));
  const done = spawnSync(process.execPath, [scriptFile, settingsFile], { encoding: "utf8" });
  expect(done.stderr).toBe("");
  return done.stdout;
}

verifies("sandbox-mxc.session", () => {
  let folder = "";
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "mxc-probe-"));
  });
  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  describe("the leak probe program", () => {
    it("reports a file it can read as readable and one it can't as hidden, and a closed port as blocked", async () => {
      writeFileSync(join(folder, "control.txt"), "control");
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
      const address = closed.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      await new Promise<void>((resolve) => closed.close(() => resolve()));
      const output = run(leakProbeScript, folder, {
        control: join(folder, "control.txt"),
        hidden: join(folder, "gone.txt"),
        denied: join(folder, "control.txt"),
        ports: [{ host: "127.0.0.1", port }],
      });
      expect(parseLeakReport(output)).toEqual({
        control: "readable",
        hidden: "hidden",
        denied: "readable",
        ports: [{ host: "127.0.0.1", port, state: "refused", code: "ECONNREFUSED" }],
        lan: [],
        internet: [],
        dns: [],
        network: null,
      });
    });

    it("reports an open port as connected, as a port of this computer and as an address of the local network", async () => {
      const open = createServer((socket) => socket.destroy());
      await new Promise<void>((resolve) => open.listen(0, "127.0.0.1", resolve));
      const address = open.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      try {
        // Asynchronously: this thread's event loop must stay free to take the connection.
        writeFileSync(join(folder, "probe.cjs"), leakProbeScript);
        const settings = {
          control: "x",
          hidden: "x",
          denied: "x",
          ports: [{ host: "127.0.0.1", port }],
          lan: [{ host: "127.0.0.1", port }],
        };
        writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
        const { stdout: output } = await execFileAsync(process.execPath, [
          join(folder, "probe.cjs"),
          join(folder, "probe.json"),
        ]);
        const connected = [{ host: "127.0.0.1", port, state: "connected", code: null }];
        expect(parseLeakReport(output)).toMatchObject({ ports: connected, lan: connected });
      } finally {
        await new Promise<void>((resolve) => open.close(() => resolve()));
      }
    });

    it("tries to create, change and remove files where it is given, and survives being refused", () => {
      mkdirSync(join(folder, "hidden"));
      writeFileSync(join(folder, "hidden", "victim.txt"), "original");
      const output = run(leakProbeScript, folder, {
        control: "x",
        hidden: "x",
        denied: "x",
        ports: [],
        writes: [
          {
            create: join(folder, "hidden", "created.txt"),
            existing: join(folder, "hidden", "victim.txt"),
          },
          {
            create: join(folder, "nowhere", "created.txt"),
            existing: join(folder, "nowhere", "victim.txt"),
          },
        ],
      });
      expect(parseLeakReport(output)).not.toBeNull();
      expect(readFileSync(join(folder, "hidden", "created.txt"), "utf8")).toBe(
        "written by the box",
      );
      expect(() => readFileSync(join(folder, "hidden", "victim.txt"))).toThrow();
    });
  });

  describe("the network attempts of the leak probe program", () => {
    /** A port nobody listens on. */
    async function closedPort(): Promise<number> {
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
      const address = closed.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      await new Promise<void>((resolve) => closed.close(() => resolve()));
      return port;
    }

    it("reports the bridge, the internet targets and the DNS targets, each with its own state", async () => {
      const bridge = createServer((socket) => socket.destroy());
      await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
      const address = bridge.address();
      const bridgePort = typeof address === "object" && address !== null ? address.port : 0;
      const refusedPort = await closedPort();
      try {
        writeFileSync(join(folder, "probe.cjs"), leakProbeScript);
        const settings = {
          control: "x",
          hidden: "x",
          denied: "x",
          ports: [],
          internet: [{ host: "127.0.0.1", port: refusedPort }],
          dns: [{ host: "127.0.0.1", port: refusedPort }],
          bridge: { host: "127.0.0.1", port: bridgePort },
        };
        writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
        const { stdout } = await execFileAsync(process.execPath, [
          join(folder, "probe.cjs"),
          join(folder, "probe.json"),
        ]);
        const report = parseLeakReport(stdout);
        expect(report?.network).toEqual({
          host: "127.0.0.1",
          port: bridgePort,
          state: "connected",
          code: null,
        });
        expect(report?.internet[0]).toMatchObject({ state: "refused", code: "ECONNREFUSED" });
        // A UDP packet to a closed port comes back as nothing here, or as a refusal: never as an answer.
        expect(report?.dns[0]?.state).not.toBe("connected");
      } finally {
        await new Promise<void>((resolve) => bridge.close(() => resolve()));
      }
    });

    it("with no bridge and selfControl set, reports the probe's own TCP connection and UDP datagram as the network control", async () => {
      writeFileSync(join(folder, "probe.cjs"), leakProbeScript);
      const settings = {
        control: "x",
        hidden: "x",
        denied: "x",
        ports: [],
        bridge: null,
        selfControl: true,
      };
      writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
      const { stdout } = await execFileAsync(process.execPath, [
        join(folder, "probe.cjs"),
        join(folder, "probe.json"),
      ]);
      expect(parseLeakReport(stdout)?.network).toMatchObject({
        host: "127.0.0.1",
        state: "connected",
        code: null,
      });
    });

    it("reports no network control with no bridge and no selfControl", async () => {
      writeFileSync(join(folder, "probe.cjs"), leakProbeScript);
      const settings = { control: "x", hidden: "x", denied: "x", ports: [], bridge: null };
      writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
      const { stdout } = await execFileAsync(process.execPath, [
        join(folder, "probe.cjs"),
        join(folder, "probe.json"),
      ]);
      expect(parseLeakReport(stdout)?.network).toBeNull();
    });

    it("reports a DNS answer as connected", async () => {
      const server = createSocket("udp4");
      server.on("message", (message, remote) => server.send(message, remote.port, remote.address));
      await new Promise<void>((resolve) => server.bind(0, "127.0.0.1", resolve));
      const port = server.address().port;
      try {
        writeFileSync(join(folder, "probe.cjs"), leakProbeScript);
        const settings = {
          control: "x",
          hidden: "x",
          denied: "x",
          ports: [],
          dns: [{ host: "127.0.0.1", port }],
        };
        writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
        const { stdout } = await execFileAsync(process.execPath, [
          join(folder, "probe.cjs"),
          join(folder, "probe.json"),
        ]);
        expect(parseLeakReport(stdout)?.dns).toEqual([
          { host: "127.0.0.1", port, state: "connected", code: null },
        ]);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("reports an error that is not a refusal as failed, with its code", () => {
      const output = run(leakProbeScript, folder, {
        control: "x",
        hidden: "x",
        denied: "x",
        // A bad port fails at once, with no DNS lookup that could time out first.
        ports: [{ host: "127.0.0.1", port: -1 }],
      });
      const [attempt] = parseLeakReport(output)?.ports ?? [];
      expect(attempt?.state).toBe("failed");
      expect(attempt?.code).toBe("ERR_SOCKET_BAD_PORT");
    });
  });

  describe("the work probe program", () => {
    it("lists the folder, writes a file in it and removes it again", () => {
      writeFileSync(join(folder, "project.txt"), "project");
      const output = run(workProbeScript, folder, { folder, name: ".canary-write" });
      expect(parseWorkReport(output)).toEqual({ listed: true, wrote: true });
      expect(() => readFileSync(join(folder, ".canary-write"))).toThrow();
    });

    it("reports a folder it can't list or write", () => {
      const output = run(workProbeScript, folder, { folder: join(folder, "gone"), name: "x" });
      expect(parseWorkReport(output)).toEqual({ listed: false, wrote: false });
    });
  });

  describe("reading what the programs print", () => {
    it("takes the last line, and nothing from a crash, other text or a wrong shape", () => {
      expect(
        parseLeakReport(
          'noise\n{"control":"readable","hidden":"hidden","denied":"hidden","ports":[]}\n',
        ),
      ).toEqual({
        control: "readable",
        hidden: "hidden",
        denied: "hidden",
        ports: [],
        lan: [],
        internet: [],
        dns: [],
        network: null,
      });
      for (const output of [
        "",
        "hello",
        "null",
        '{"control":"readable"}',
        '{"control":1,"hidden":"","denied":"","ports":[]}',
      ]) {
        expect(parseLeakReport(output)).toBeNull();
      }
      for (const output of [
        "",
        "hello",
        "null",
        '{"listed":true}',
        '{"listed":"yes","wrote":true}',
      ]) {
        expect(parseWorkReport(output)).toBeNull();
      }
    });
  });
});
