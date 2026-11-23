// The page's engine starts Run, the Inbox form and Run now from the live version, as the CLI does
// (HAL-14229, `app.runs-read-latest-version`): a saved change isn't used until it is made live.

import { MemoryVcs } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";
import { GitMissingError, type LiveVersions } from "./page-versions.ts";

const reply = { hubId: "support", workflowId: "reply" };
const replyPath = "hubs/support/workflows/reply.workflow.yaml";

/** `reply` with its first state named `draft`, a change that is saved but not live. */
const savedReply = [
  "id: reply",
  "name: Reply",
  "initial: draft",
  "states:",
  "  draft:",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

/** Acme in a repository with one version, and `reply` changed since, saved but not live. */
async function acmeWithASavedChange() {
  const files = acmeFiles();
  const vcs = new MemoryVcs(files);
  await vcs.init();
  await vcs.stage((await files.list()) ?? []);
  const commit = await vcs.commit("First version");
  await files.write(replyPath, savedReply);
  return { files, vcs, commit };
}

verifies("studio.engine-service", () => {
  it("starts Run from the live version, not from a saved change that isn't live", async () => {
    const { files, vcs, commit } = await acmeWithASavedChange();
    const service = serviceOn(fakeShell(), files, { versions: vcs });
    const { executor, runs } = await service.open();
    const start = vi.spyOn(executor, "start");

    const { id } = await service.startRun(reply, {});

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        version: expect.objectContaining({ reads: "live-version", commit }),
      }),
    );
    const run = await runs.get(id);
    expect(run?.statesVisited[0]).toBe("write");
    await service.close();
  });

  it("starts Run now from the live version too", async () => {
    const { files, vcs, commit } = await acmeWithASavedChange();
    const service = serviceOn(fakeShell(), files, { versions: vcs });
    const { executor, runs } = await service.open();
    const start = vi.spyOn(executor, "start");

    const at = "2026-11-15T10:00:00.000Z";
    const { id } = await service.startRoutine(
      { workflow: { ...reply, input: {} } },
      { routineKey: "support/hourly", at },
    );

    expect(start.mock.calls[0]?.[0].version).toMatchObject({ reads: "live-version", commit });
    expect((await runs.get(id))?.statesVisited[0]).toBe("write");
    await service.close();
  });

  it("keeps the saved files with history off", async () => {
    const files = acmeFiles({}, { [replyPath]: savedReply });
    const service = serviceOn(fakeShell(), files, { versions: new MemoryVcs(files) });
    const { executor, runs } = await service.open();
    const start = vi.spyOn(executor, "start");

    const { id } = await service.startRun(reply, {});

    expect(start.mock.calls[0]?.[0].version).toEqual({ reads: "saved-files" });
    expect((await runs.get(id))?.statesVisited[0]).toBe("draft");
    await service.close();
  });

  it("refuses as `conflict` while nothing is live, before the lock", async () => {
    const files = acmeFiles();
    const vcs = new MemoryVcs(files);
    await vcs.init();
    const shell = fakeShell();
    const service = serviceOn(shell, files, { versions: vcs });

    await expect(service.startRun(reply, {})).rejects.toMatchObject({
      kind: "conflict",
      message: "Nothing is live yet, so there is nothing to run.",
      fix: "Create a first version, then try again.",
    });
    expect(lockCalls(shell)).toEqual([]);
  });

  it("refuses as `unavailable` with the CLI's fix when git can't read the live version", async () => {
    const files = acmeFiles();
    const noGit: LiveVersions = {
      status: () => Promise.reject(new GitMissingError()),
      log: () => Promise.reject(new GitMissingError()),
      readAt: () => Promise.reject(new GitMissingError()),
      listAt: () => Promise.reject(new GitMissingError()),
    };
    const service = serviceOn(fakeShell(), files, { versions: noGit });

    await expect(service.startRun(reply, {})).rejects.toMatchObject({
      kind: "unavailable",
      message: "git can't start on this computer, so the live version can't be read.",
      fix: "Install git and make sure it's on your PATH, then try again.",
    });
  });

  it("refuses a live version that isn't trusted, even when the saved files are", async () => {
    const { files, vcs } = await acmeWithASavedChange();
    // Only the saved files, whose `reply` starts at `draft`, are trusted here.
    const mayStart = async (workspace: LoadedWorkspace) =>
      filesOf(workspace, "workflow").some((file) => file.value.initial === "draft");
    const service = serviceOn(fakeShell(), files, { versions: vcs, mayStart });

    await expect(service.startRun(reply, {})).rejects.toMatchObject({ kind: "denied" });
  });
});
