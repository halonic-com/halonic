import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProgramProbe } from "./program-probe.ts";

// The probe tests that need no `/bin/sh`: the program asked is Node itself,
// told what to do through its arguments (`-e <code>`). They run on every
// system, Windows included. The shell-script tests are the POSIX-only ones.

const node = process.execPath;
const nodeDir = dirname(node);
const nodeName = process.platform === "win32" ? "node.exe" : "node";
const brokenFile = "broken.exe";
// Windows adds the `.exe` itself; POSIX asks for the file name as it is.
const brokenName = process.platform === "win32" ? "broken" : brokenFile;

let dir = "";

function probe(extra: Record<string, string> = {}, timeoutMs = 5_000) {
  return createProgramProbe({ env: { PATH: `${dir}${delimiter}${nodeDir}`, ...extra }, timeoutMs });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hs-node-"));
  // Starting it fails: no such interpreter on POSIX, not a valid image on Windows.
  await writeFile(join(dir, brokenFile), "#!/nonexistent/interpreter\n");
  await chmod(join(dir, brokenFile), 0o755);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

verifies("sandbox-host.program-probe-node", () => {
  describe("with Node as the program", () => {
    it("is missing for a name with a path separator", async () => {
      expect(await probe().ask("./node", [])).toEqual({ status: "missing" });
      expect(await probe().ask(".\\node", [])).toEqual({ status: "missing" });
      expect(await probe().ask(node, [])).toEqual({ status: "missing" });
      expect(await probe().ask("", [])).toEqual({ status: "missing" });
    });

    it("is missing when no PATH folder holds the name", async () => {
      expect(await probe().ask("nonesuch", [])).toEqual({ status: "missing" });
    });

    it("ignores relative PATH entries", async () => {
      const env = { PATH: `${delimiter}.${delimiter}bin` };
      expect(await createProgramProbe({ env }).ask("node", [])).toEqual({ status: "missing" });
    });

    it("finds the program on PATH and reports its path, code and output", async () => {
      const answer = await probe().ask("node", [
        "-e",
        'console.log("hello 1.2.3"); console.error("oops"); process.exit(3)',
      ]);
      expect(answer).toMatchObject({
        status: "ran",
        path: join(nodeDir, nodeName),
        code: 3,
      });
      expect(answer.status === "ran" && answer.stdout.trim()).toBe("hello 1.2.3");
      expect(answer.status === "ran" && answer.stderr.trim()).toBe("oops");
    });

    it("passes only PATH and HOME on, not the launcher's other variables", async () => {
      const answer = await probe({ MY_TOKEN: "secret", HOME: "users-x" }).ask("node", [
        "-e",
        "console.log(JSON.stringify({ token: process.env.MY_TOKEN ?? null, home: process.env.HOME ?? null, hasPath: Boolean(process.env.PATH) }))",
      ]);
      expect(answer).toMatchObject({ status: "ran", code: 0 });
      const text = answer.status === "ran" ? answer.stdout : "";
      expect(JSON.parse(text)).toEqual({ token: null, home: "users-x", hasPath: true });
    });

    it("kills a program that runs too long and says so in one sentence", async () => {
      const answer = await probe({}, 300).ask("node", ["-e", "setInterval(() => {}, 1000)"]);
      expect(answer).toEqual({
        status: "failed",
        path: join(nodeDir, nodeName),
        error: "node didn't finish in time and was stopped.",
      });
    });

    it("cuts each output at 4 KB", async () => {
      const answer = await probe().ask("node", [
        "-e",
        'process.stdout.write("x".repeat(10000)); process.stderr.write("e".repeat(10000))',
      ]);
      expect(answer).toMatchObject({ status: "ran", code: 0 });
      expect(answer.status === "ran" && answer.stdout.length).toBe(4096);
      expect(answer.status === "ran" && answer.stderr.length).toBe(4096);
    });

    it("fails, without throwing, when the program can't be started", async () => {
      const answer = await probe().ask(brokenName, []);
      expect(answer).toEqual({
        status: "failed",
        path: join(dir, brokenFile),
        error: `${brokenName} was found but couldn't be started.`,
      });
    });
  });
});
