// The page's engine starts Run, the Inbox form and Run now from the live version, as the CLI does
// (HAL-14229, `app.runs-read-latest-version`): a saved change isn't used until it is made live.

import { MemoryVcs } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, serviceOn } from "./engine-service.testing.ts";

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
});
