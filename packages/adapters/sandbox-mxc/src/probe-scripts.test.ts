import { execFile, spawnSync } from "node:child_process";
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
        ports: [{ host: "127.0.0.1", port, state: "blocked" }],
      });
    });

    it("reports an open port as connected", async () => {
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
        };
        writeFileSync(join(folder, "probe.json"), JSON.stringify(settings));
        const { stdout: output } = await execFileAsync(process.execPath, [
          join(folder, "probe.cjs"),
          join(folder, "probe.json"),
        ]);
        expect(parseLeakReport(output)?.ports).toEqual([
          { host: "127.0.0.1", port, state: "connected" },
        ]);
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
