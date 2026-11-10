import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProgramProbe } from "./program-probe.ts";

// Holes found by the attack tests (HAL-2650): the time limit stops only the
// program, not the children it started. Both tests fail on the probe as it is.

let dir = "";

async function script(name: string, body: string): Promise<void> {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!isRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !isRunning(pid);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hs-holes-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

verifies("sandbox-host.program-probe-node", () => {
  describe.skipIf(process.platform === "win32")("holes on a POSIX system", () => {
    it("stops a child that the stopped program left running", async () => {
      const pidFile = join(dir, "forker.pid");
      await script("forker", `sleep 30 & echo $! > ${pidFile}; sleep 30`);
      const answer = await createProgramProbe({
        env: { PATH: `${dir}:/usr/bin:/bin` },
        timeoutMs: 300,
      }).ask("forker", []);
      expect(answer).toMatchObject({ status: "failed" });
      const pid = Number(await readFile(pidFile, "utf8"));
      const gone = await waitUntilGone(pid, 1_000);
      if (!gone) process.kill(pid, "SIGKILL");
      expect(gone).toBe(true);
    });

    it("stops a child that holds the program's output open after it exits", async () => {
      const pidFile = join(dir, "holder.pid");
      await script("holder", `sleep 30 & echo $! > ${pidFile}; exit 0`);
      await createProgramProbe({ env: { PATH: `${dir}:/usr/bin:/bin` }, timeoutMs: 300 }).ask(
        "holder",
        [],
      );
      const pid = Number(await readFile(pidFile, "utf8"));
      const gone = await waitUntilGone(pid, 1_000);
      if (!gone) process.kill(pid, "SIGKILL");
      expect(gone).toBe(true);
    });
  });
});
