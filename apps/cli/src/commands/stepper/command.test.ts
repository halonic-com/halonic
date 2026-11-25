import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stepperRequestFormat } from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { stepperCommand } from "./command.ts";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-stepper-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function writeRequest(blocks: unknown[]): string {
  const request = { format: stepperRequestFormat, title: "Restart acme", reason: "", blocks };
  writeFileSync(join(folder, "request.json"), JSON.stringify(request));
  return "request.json";
}

async function guide(...args: string[]) {
  const io = captureIo(folder);
  const code = await runCli(["stepper", "guide", ...args], io, [stepperCommand]);
  return { code, io };
}

verifies("cli.commands.stepper.guide", () => {
  describe("halonic stepper guide", () => {
    it("prints the guide of a request that validates", async () => {
      const file = writeRequest([
        {
          kind: "server-session",
          task: "HAL-1234",
          steps: ["Restart the acme worker."],
          doneWhen: "the worker answers",
        },
      ]);
      const { code, io } = await guide(file);
      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "Restart acme",
        "",
        "Do these steps in order, signed in with your own account:",
        "1. Open a terminal and sign in to your server with ssh.",
        "2. (from the requester, not checked by Halonic) Restart the acme worker.",
        "3. (from the requester, not checked by Halonic) Check that it's done: the worker answers",
        "4. Report back on HAL-1234. Never paste a key, token or password into the task.",
      ]);
    });

    it("refuses a request the stepper would refuse, naming the block", async () => {
      const file = writeRequest([
        { kind: "step", ref: "github.delete-repo@1", parameters: { owner: "acme" } },
      ]);
      const { code, io } = await guide(file);
      expect(code).toBe(exitCode.usage);
      expect(io.stdout).toEqual([]);
      expect(io.stderr.join("\n")).toContain(
        "block 1: `github.delete-repo@1` isn't a reviewed step type",
      );
    });

    it("gives the reasons as JSON", async () => {
      const file = writeRequest([
        { kind: "browser", url: "https://evil.example/", instructions: ["x"] },
      ]);
      const { code, io } = await guide(file, "--json");
      expect(code).toBe(exitCode.usage);
      const document = JSON.parse(io.stdout.join("\n"));
      expect(document.ok).toBe(false);
      expect(document.error.reasons[0]).toMatch(/^block 1: /);
    });

    it("says there's no file", async () => {
      const { code, io } = await guide("missing.json");
      expect(code).toBe(exitCode.usage);
      expect(io.stderr.join("\n")).toContain("there's no file missing.json.");
    });

    it("refuses no file or two files as wrong usage", async () => {
      expect((await guide()).code).toBe(exitCode.usage);
      expect((await guide("a.json", "b.json")).code).toBe(exitCode.usage);
    });
  });
});
