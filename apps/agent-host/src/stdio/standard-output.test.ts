import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { takeStandardOutput } from "./standard-output.ts";

describe("takeStandardOutput", () => {
  it("keeps standard output for the returned stream and sends any other print to standard error", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const output = takeStandardOutput(stdout, stderr);

    stdout.write("a stray print\n");
    await new Promise<void>((resolve) => output.write(Buffer.from([0, 1, 2]), () => resolve()));

    expect([...(stdout.read() as Buffer)]).toEqual([0, 1, 2]);
    expect((stderr.read() as Buffer).toString()).toBe("a stray print\n");
  });

  it("fails when standard output fails", async () => {
    const stdout = new PassThrough();
    const output = takeStandardOutput(stdout, new PassThrough());
    const failed = new Promise((resolve) => output.once("error", resolve));
    stdout.destroy(new Error("EPIPE"));
    expect(await failed).toMatchObject({ message: "EPIPE" });
  });
});
