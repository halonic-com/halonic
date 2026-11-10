import { type ChildProcess, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProgramProbe } from "./program-probe.ts";

const onWindows = process.platform === "win32";
const skipOnWindows = "[platform:win32] needs /bin/sh scripts: ";

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

/** Starts a launcher process with one probe of a hanging program; resolves once the program runs. */
async function launchWithHangingProbe(
  how: string,
  ownHandlerLog?: string,
): Promise<{ launcher: ChildProcess; pid: number; exited: Promise<unknown> }> {
  // One name per launch: a pid file left by an earlier launch would be read as this one's.
  const name = `${how}${ownHandlerLog ? "-own-handler" : ""}`;
  const pidFile = join(dir, `launcher-${name}.pid`);
  await script(`hang-${name}`, `echo $$ > ${pidFile}; sleep 30`);
  const probeUrl = new URL("./program-probe.ts", import.meta.url).href;
  const ending =
    how === "exit" ? "setTimeout(() => process.exit(0), 300);" : "setInterval(() => {}, 1000);";
  const code = `
    import { createProgramProbe } from ${JSON.stringify(probeUrl)};
    createProgramProbe({ env: { PATH: ${JSON.stringify(`${dir}:/usr/bin:/bin`)} } }).ask(${JSON.stringify(`hang-${name}`)}, []);
    ${
      ownHandlerLog
        ? `import { appendFileSync } from "node:fs";
    process.on(${JSON.stringify(how)}, () => { appendFileSync(${JSON.stringify(ownHandlerLog)}, "x"); setTimeout(() => process.exit(0), 300); });`
        : ""
    }
    ${ending}
  `;
  const launcher = spawn(process.execPath, ["--input-type=module", "-e", code], {
    stdio: "ignore",
  });
  const exited = new Promise((resolve) => launcher.on("exit", resolve));
  const until = Date.now() + 5_000;
  let pid = 0;
  while (Date.now() < until && pid === 0) {
    pid = Number(await readFile(pidFile, "utf8").catch(() => "0"));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(pid).toBeGreaterThan(0);
  return { launcher, pid, exited };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hs-holes-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

verifies("sandbox-host.program-probe-node", () => {
  describe("holes on a POSIX system", () => {
    it.skipIf(onWindows)(
      `${skipOnWindows}stops a child that the stopped program left running`,
      async () => {
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
      },
    );

    it.skipIf(onWindows)(
      `${skipOnWindows}stops a child that holds the program's output open after it exits`,
      async () => {
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
      },
    );

    for (const how of ["SIGINT", "SIGTERM", "exit"] as const) {
      it.skipIf(onWindows)(
        `${skipOnWindows}stops a running probe when the launcher ends by ${how}`,
        async () => {
          const { launcher, pid, exited } = await launchWithHangingProbe(how);
          if (how !== "exit") launcher.kill(how);
          await exited;
          const gone = await waitUntilGone(pid, 1_000);
          if (!gone) process.kill(pid, "SIGKILL");
          expect(gone).toBe(true);
        },
      );
    }

    it.skipIf(onWindows)(
      `${skipOnWindows}leaves the launcher's own SIGINT handler to see the signal once and still stops the probe`,
      async () => {
        const log = join(dir, "own-handler.log");
        const { launcher, pid, exited } = await launchWithHangingProbe("SIGINT", log);
        launcher.kill("SIGINT");
        await exited;
        const gone = await waitUntilGone(pid, 1_000);
        if (!gone) process.kill(pid, "SIGKILL");
        expect(gone).toBe(true);
        expect(await readFile(log, "utf8")).toBe("x");
      },
    );
  });
});
