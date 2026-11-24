import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  childEnv,
  isTailscaleProgram,
  nodeTailscaleRunner,
  runProgram,
} from "./tailscale-runner.ts";

// Node itself stands in for `tailscale` in `runProgram`, which runs whatever
// path it is given, so a script given with `-e` plays the part on every platform.
const node = process.execPath;
const env = { PATH: process.env["PATH"] ?? "" };

verifies("tunnel-tailscale.provider", () => {
  describe("nodeTailscaleRunner", () => {
    it("runs the program with the arguments as given and collects its output", async () => {
      const reply = await runProgram(
        node,
        ["-e", "process.stdout.write(process.argv[1])", "a b;c"],
        env,
        10_000,
      );
      expect(reply).toEqual({ kind: "done", code: 0, stdout: "a b;c", stderr: "" });
    });

    it("reports the exit code of a program that fails", async () => {
      const reply = await runProgram(node, ["-e", "process.exit(3)"], env, 10_000);
      expect(reply).toMatchObject({ kind: "done", code: 3 });
    });

    it("passes on only the variables the CLI needs", () => {
      const launcher = { PATH: "/usr/bin", HOME: "/acme-home", ACME_TOKEN: "not-for-tailscale" };
      expect(childEnv(launcher)).toEqual({ PATH: "/usr/bin", HOME: "/acme-home" });
    });

    it("answers missing when there is no such program", async () => {
      const runner = nodeTailscaleRunner({ program: "acme-no-such-tailscale", env: { PATH: "" } });
      expect(await runner.run(["version"])).toEqual({ kind: "missing" });
    });

    it("kills a program that doesn't answer within its time limit", async () => {
      const reply = await runProgram(node, ["-e", "setInterval(() => {}, 1000)"], env, 300);
      expect(reply).toEqual({ kind: "failed", why: "tailscale didn't answer within 300 ms." });
    });

    it("starts only a program named tailscale, never one in a scripts folder", async () => {
      expect(isTailscaleProgram("tailscale")).toBe(true);
      expect(isTailscaleProgram("/Applications/Tailscale.app/Contents/MacOS/Tailscale")).toBe(true);
      expect(isTailscaleProgram("Tools\\Tailscale\\tailscale.exe")).toBe(true);
      expect(isTailscaleProgram(node)).toBe(false);
      expect(isTailscaleProgram("/acme/skills/tunnel/scripts/tailscale")).toBe(false);
      expect(isTailscaleProgram("acme\\Scripts\\tailscale.exe")).toBe(false);
      const runner = nodeTailscaleRunner({ program: node });
      expect(await runner.run(["-e", "process.exit(0)"])).toEqual({ kind: "missing" });
    });
  });
});
