import { existsSync } from "node:fs";
import { readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { profileFolder } from "@halonicjs/profile";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { instructionTrustFolder } from "./local-harness-host.ts";
import {
  acme,
  agentFile,
  commitWorkspace,
  entriesOf,
  fakesFor,
  gitTimeout,
  openEngine as openEngineWith,
  profile,
  reported,
  runChange,
  setUpRig,
  tearDownRig,
  trustCoderInstructions,
  workspaceFolderInProfile,
} from "./test/local-harness-host-kit.ts";

// The CLI's harness host (HAL-7747), run through the real engine on real
// folders: the Node parts that would start a program are fakes, and what the
// fake program does to the disk is what the tests look at.

beforeEach(setUpRig);
afterEach(tearDownRig);

const openEngine = (fakes: Parameters<typeof openEngineWith>[0], git = true) =>
  openEngineWith(fakes, contractGrant, git);

verifies("cli.local-harness-host", () => {
  it(
    "keeps an agent's file out of a connector's copy, in the proposal folder until the run ends",
    async () => {
      const version = await commitWorkspace();
      const inConnectorCopy: boolean[] = [];
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
          inConnectorCopy.push(
            ...fakes.connectorFolders.map((copy) => existsSync(join(copy, agentFile))),
          );
        },
      });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      // The connector started before the agent wrote, and the file never reached its copy.
      expect(inConnectorCopy).toEqual([false]);
      expect(fakes.connectorsClosed).toEqual(["notes"]);
      // Nor did it reach the workspace: it is only in the proposal.
      expect(existsSync(join(acme, agentFile))).toBe(false);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "takes the proposal before it releases the worktree",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
        },
      });
      const engine = await openEngine(fakes);

      const { runId } = await runChange(engine, version);

      const folders = await workspaceFolderInProfile();
      const record = await readFile(join(folders, "proposals", `${runId}.json`), "utf8");
      expect(record).toContain(agentFile);
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "runs and ends a harness run that writes no files, with no proposal",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      const folders = await workspaceFolderInProfile();
      expect(await entriesOf(join(folders, "proposals"))).toEqual([]);
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it("runs a harness run in a copy of the saved files when the workspace has no history, and keeps its proposal", async () => {
    const written: string[] = [];
    const fakes = fakesFor({
      onStart: async (given) => {
        written.push(given.workingFolder);
        await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
      },
    });
    const engine = await openEngine(fakes, false);

    const { runId, summary } = await runChange(engine, { reads: "saved-files" });

    expect(summary).toMatchObject({ status: "completed" });
    const folders = await workspaceFolderInProfile();
    // The run wrote in the run side of its copy, never in the workspace.
    expect(written).toHaveLength(1);
    expect(written[0]?.endsWith(join("run-copies", runId, "run", "files", "agents", "coder"))).toBe(
      true,
    );
    expect(existsSync(join(acme, agentFile))).toBe(false);
    const record = await readFile(join(folders, "proposals", `${runId}.json`), "utf8");
    expect(record).toContain(agentFile);
    expect(reported).toEqual([]);
  });

  it(
    "ends a harness run it found interrupted at the next start, keeping its proposal",
    async () => {
      const version = await commitWorkspace();
      const stuck = fakesFor({
        hangs: true,
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "half done");
        },
      });
      const first = await openEngine(stuck);
      // The run goes on while the program hangs, so the start doesn't come back until it is cancelled.
      const starting = first.executor.start({
        hubId: "lab",
        workflowId: "change",
        input: { note: "Write change.txt" },
        version,
      });
      await stuck.started;
      await first.close();
      await starting.catch(() => undefined);
      const [lost] = await first.runs.list({ status: "running" });
      if (lost === undefined) throw new Error("The first run isn't going.");

      const next = await openEngine(fakesFor({ onStart: async () => {} }));
      // The first run of the new engine ends what the last one lost.
      await next.executor.start({
        hubId: "support",
        workflowId: "support-reply",
        input: { mail: "Hi" },
      });

      expect(await next.runs.get(lost.id)).toMatchObject({ status: "failed" });
      const folders = await workspaceFolderInProfile();
      expect(await readFile(join(folders, "proposals", `${lost.id}.json`), "utf8")).toContain(
        agentFile,
      );
      expect(await entriesOf(join(folders, "proposal-worktrees"))).toEqual([]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );

  it(
    "opens the engine when clearing what a harness run left fails, and reports it",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({
        onStart: async (given) => {
          await writeFile(join(given.workingFolder, "change.txt"), "the agent's change");
        },
      });
      await runChange(await openEngine(fakes), version);
      // The proposal is kept, so the next start asks git, which can't read the workspace any more.
      await rm(join(acme, ".git"), { recursive: true, force: true });

      const next = await openEngine(fakesFor({ onStart: async () => {} }));

      expect(next.runs).toBeDefined();
      expect(reported).toHaveLength(1);
    },
    gitTimeout,
  );

  it(
    "denies a harness run the profile root, and writes only the run's own folders in it",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      await runChange(engine, version);

      const [given] = fakes.profiles;
      const root = await realpath(profileFolder(profile).root);
      expect(given?.deniedPaths).toContain(root);
      const writable = [
        given?.workingFolder,
        given?.tempFolder,
        given?.settingsFolder ?? undefined,
      ];
      for (const path of writable.filter((each) => each !== undefined)) {
        const inside = relative(root, path);
        expect(inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)).toBe(true);
        expect(given?.reopenedPaths ?? []).not.toContain(root);
      }
      // Every reopened path is one of the run's own, never the root or one of the engine's other folders.
      const folders = await realpath(await workspaceFolderInProfile());
      for (const path of given?.reopenedPaths ?? []) {
        expect(
          [join(folders, "proposal-worktrees"), join(folders, "harness-temp")].some((own) => {
            const inside = relative(own, path);
            return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
          }),
        ).toBe(true);
      }
    },
    gitTimeout,
  );

  it(
    "refuses a harness run whose instructions changed since a person trusted them, before the program starts",
    async () => {
      const version = await commitWorkspace();
      await trustCoderInstructions("Write the old change.");
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "failed" });
      expect(JSON.stringify(summary)).toContain("AGENTS.md");
      expect(fakes.programStarts).toBe(0);
    },
    gitTimeout,
  );

  it(
    "gives the program the instructions a person trusted, not a second read of the file",
    async () => {
      const version = await commitWorkspace();
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);
      // The file changes on disk after the engine opened; the run reads its own version.
      await writeFile(
        join(acme, "hubs/lab/agents/coder.agent.yaml"),
        "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write something else.\n",
      );

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      expect(fakes.instructions).toEqual(["Write the change."]);
    },
    gitTimeout,
  );

  it(
    "refuses a harness run whose instructions nobody trusted",
    async () => {
      const version = await commitWorkspace();
      await rm(instructionTrustFolder(profileFolder(profile)), { recursive: true, force: true });
      const fakes = fakesFor({ onStart: async () => {} });
      const engine = await openEngine(fakes);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "failed" });
      expect(fakes.programStarts).toBe(0);
    },
    gitTimeout,
  );

  it("keeps the trusted instructions in the profile, never in the workspace", async () => {
    expect(instructionTrustFolder(profileFolder(profile))).toBe(
      join(profileFolder(profile).root, "instruction-trust"),
    );
    expect(existsSync(join(acme, "instruction-trust"))).toBe(false);
    expect(await readdir(instructionTrustFolder(profileFolder(profile)))).toHaveLength(1);
  });
});
