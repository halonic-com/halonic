import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { runOldCli } from "./old-cli.ts";
import { fakeOldRepo } from "./test/fake-old-repo.ts";
import { TestFolders } from "./test-folders.ts";

// The tests start git and Node processes, which can take longer than 5 s on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

/** A scratch folder with an empty home and a one-file workspace, as the runner gets them. */
function scratch(): { home: string; dir: string } {
  const root = folders.make();
  const home = join(root, "home");
  const dir = join(root, "base");
  mkdirSync(home);
  mkdirSync(dir);
  folders.write(dir, { "workspace.yaml": "id: acme\n" });
  return { home, dir };
}

verifies("parity.runner-records-cli-output", () => {
  const at = "2026-01-01T00:00:00.000Z";
  const time = Date.parse(at).toString(36);

  it("records each call's output, stored runs and files, with the clock and random source fixed", () => {
    const { clone } = fakeOldRepo(folders);
    const { home, dir } = scratch();
    const [first, second] = [`run_${time}_00000001`, `run_${time}_00000002`];
    expect(
      runOldCli(clone, home, dir, [
        { name: "nested run", args: ["run", "<workspace>", "nested"] },
        { name: "unknown", args: ["nope", "<workspace>"] },
      ]),
    ).toEqual([
      {
        name: "nested run",
        args: ["run", "<workspace>", "nested"],
        exitCode: 0,
        stdout: `Run ${first}: completed  (saved in <workspace>/.studio/runs)\n`,
        stderr: "",
        runs: [
          { id: first, events: [{ type: "run.started", runId: first, at, dir: "<workspace>" }] },
          {
            id: second,
            events: [{ type: "run.started", runId: second, at, dir: "<workspace>", parent: first }],
          },
        ],
        stored: [`runs/${first}.jsonl`, `runs/${second}.jsonl`],
      },
      {
        name: "unknown",
        args: ["nope", "<workspace>"],
        exitCode: 1,
        stdout: "",
        stderr: "usage: studio run <dir>\n",
        runs: [],
        stored: [],
      },
    ]);
  });

  it("runs each call on a copy, and leaves no copy behind", () => {
    const { clone } = fakeOldRepo(folders);
    const { home, dir } = scratch();
    const [run] = runOldCli(clone, home, dir, [{ name: "run", args: ["run", "<workspace>"] }]);
    expect(run?.runs).toHaveLength(1);
    expect(existsSync(join(dir, ".studio"))).toBe(false);
    expect(existsSync(`${dir}-cli`)).toBe(false);
  });

  it("stops, naming the call, when its output changes between two runs", () => {
    const { clone } = fakeOldRepo(folders);
    const { home, dir } = scratch();
    expect(() =>
      runOldCli(clone, home, dir, [{ name: "flaky", args: ["flaky", "<workspace>"] }]),
    ).toThrow(
      `The old CLI's "flaky" gave other output on a second run; fix the clock, IDs or order first`,
    );
  });
});
