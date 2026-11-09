import { execPath } from "node:process";
import { expect, it } from "vitest";
import { systemRunProgram } from "./run-program.ts";

it("gives what the program wrote to standard output and the pid it ran as", async () => {
  const ran = await systemRunProgram(execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  expect(ran.output).toBe(String(ran.pid));
});

it("refuses with the program's name and the cause when it exits with an error", async () => {
  const failing = systemRunProgram(execPath, ["-e", "process.exit(3)"]);
  await expect(failing).rejects.toThrow(`Couldn't read the process table with ${execPath}.`);
  await expect(failing).rejects.toHaveProperty("cause.code", 3);
});
