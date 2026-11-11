import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { connectRunner } from "../halonic/connect-runner.ts";
import { runnerCommand } from "../halonic/runner-command.ts";
import { bridgeOptions, fakeRunnerProcess, testNonce } from "../pipes.test-helper.ts";
import { runRunner } from "./main.ts";

// HAL-188: Halonic never runs a file under a skill's `scripts/` folder. This
// file is the runner's `scriptsTest` in `tooling/check/process-starters.json`.
// `src/runner/main.ts` loads one module with `import()`: the integration's
// entry file, which `startRunner` only accepts inside the integration's
// folder. Loading a module never starts a process, and the runner's Node is
// started without `--allow-child-process` or `--allow-worker`, so neither it
// nor the integration can start one.

const folders: string[] = [];
afterAll(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

verifies("integration-runner.start", () => {
  describe("the runner and a skill's scripts", () => {
    it("doesn't run a skill's script it is pointed at: the load fails and nothing ran", async () => {
      const folder = await mkdtemp(join(tmpdir(), "runner-skill-"));
      folders.push(folder);
      const marker = join(folder, "ran");
      const scripts = join(folder, "skills", "acme", "scripts");
      await mkdir(scripts, { recursive: true });
      const script = join(scripts, "run.sh");
      await writeFile(script, `#!/bin/sh\nprintf ran >> '${marker}'\n`);
      await chmod(script, 0o755);

      const fake = fakeRunnerProcess();
      // A plain import: the module hook would stay registered in this test's worker.
      const running = runRunner(
        [testNonce, folder, script, "acme"],
        { input: fake.runnerInput, output: fake.runnerOutput },
        (url) => import(url),
      );
      await connectRunner(bridgeOptions(fake));
      await expect(running).rejects.toThrow();
      await expect(readFile(marker, "utf8")).rejects.toThrow();
      fake.exit(1);
    });

    it("starts Node without a flag that lets it start a process or a thread", () => {
      const { args } = runnerCommand(
        {
          node: "/usr/bin/node",
          nodeFolder: "/usr",
          runnerFile: "/opt/halonic/runner.js",
          integrationFolder: "/work/weather",
        },
        {
          nonce: "n-1",
          folder: "/work/weather",
          entryFile: "/work/weather/index.js",
          exportName: "weather",
        },
      );
      expect(args).toContain("--permission");
      for (const flag of [
        "--allow-child-process",
        "--allow-worker",
        "--allow-addons",
        "--allow-wasi",
      ]) {
        expect(args.some((arg) => arg.startsWith(flag))).toBe(false);
      }
    });
  });
});
