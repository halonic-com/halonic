import { execPath } from "node:process";
import { expect, it } from "vitest";
import { systemRunProgram } from "./run-program.ts";

it("gives what the program wrote to standard output", async () => {
  expect(await systemRunProgram(execPath, ["-e", "process.stdout.write('ready')"])).toBe("ready");
});

it("refuses with the program's name and the cause when it exits with an error", async () => {
  const failing = systemRunProgram(execPath, ["-e", "process.exit(3)"]);
  await expect(failing).rejects.toThrow(`Couldn't read the process table with ${execPath}.`);
  await expect(failing).rejects.toHaveProperty("cause.code", 3);
});
