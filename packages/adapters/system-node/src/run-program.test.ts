import { execPath } from "node:process";
import { expect, it } from "vitest";
import * as systemNode from "./index.ts";
import { psProgram } from "./ps-process-table.ts";
import { systemRunProgram } from "./run-program.ts";
import { windowsPowerShell } from "./windows-process-table.ts";

it("gives what the program wrote to standard output and the pid it ran as", async () => {
  const ran = await systemRunProgram(execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  expect(ran.output).toBe(String(ran.pid));
});

it("refuses with the program's name and the cause when it exits with an error", async () => {
  const failing = systemRunProgram(execPath, ["-e", "process.exit(3)"]);
  await expect(failing).rejects.toThrow(`Couldn't read the process table with ${execPath}.`);
  await expect(failing).rejects.toHaveProperty("cause.code", 3);
});

it("starts only the system's own process-table programs, never a skill's scripts", () => {
  // The package doesn't export it, so only the ps and PowerShell readers call
  // it, each with a fixed program under a system folder.
  expect(systemNode).not.toHaveProperty("systemRunProgram");
  expect(psProgram).toBe("/bin/ps");
  expect(windowsPowerShell("windows-folder")).toBe(
    "windows-folder\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  );
});
