import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import {
  headOf,
  pull,
  said,
  snapshot,
  testSettings,
} from "../merge-control/merge-control.test-helper.ts";
import type { ReviewerTasks } from "../merge-control/reviewer-asks.ts";
import type { GatePull, MergeSnapshot } from "../merge-control/snapshot.ts";
import {
  type ReviewerTaskSettings,
  type ReviewerTasksApi,
  reviewerTasksPass,
} from "./merge-control-reviewer-tasks.ts";

const live: ReviewerTaskSettings = { dryRun: false, noraShadow: true };

const liam = (number: number) => said(`Liam: approved on head \`${headOf(number).slice(0, 7)}\``);
const nora = (number: number) => said(`Nora: approved on head \`${headOf(number).slice(0, 7)}\``);
const signOff = (number: number) =>
  said(`Julian: security sign-off on head \`${headOf(number).slice(0, 12)}\``, 20);

/** #6833's shape: a trust path, Liam's approval, green, no sign-off. */
function securityPull(changes: Partial<GatePull> = {}): GatePull {
  const files = ["packages/core/app/src/trusted-runner-start.ts"];
  return pull(6833, { files, filesTotal: 1, texts: [liam(6833)], ...changes });
}

/** #6678's shape: a routine file, only Nora's approval. */
function noraPull(changes: Partial<GatePull> = {}): GatePull {
  const view = "packages/studio/features/inbox/src/view.tsx";
  return pull(6678, { files: [view], fileNet: { [view]: 30 }, texts: [nora(6678)], ...changes });
}

function fakeHost() {
  let made = 0;
  const create = vi.fn(async (input: { assigneeAgentId?: string }) => ({
    id: `task-${++made}`,
    ...input,
  }));
  const update = vi.fn(async () => ({}));
  const createComment = vi.fn(async () => ({}));
  const requestWakeup = vi.fn(async () => ({}));
  const statuses = new Map<string, string>();
  // A made task by its id, with the status the fake keeps; anything else is the author's task.
  const get = vi.fn(async (id: string) =>
    id.startsWith("task-")
      ? { id, status: statuses.get(id) ?? "todo", activeRun: null }
      : { id: `id-${id}`, projectId: "project-1" },
  );
  const agents = [
    { urlKey: "julian", id: "agent-julian" },
    { urlKey: "liam", id: "agent-liam" },
  ];
  const ctx = {
    issues: { create, update, createComment, requestWakeup, get },
    agents: { list: async () => agents },
    logger: { info: () => undefined, error: () => undefined },
  } as unknown as ReviewerTasksApi;
  return { ctx, create, update, createComment, requestWakeup, statuses };
}

async function passOf(
  ctx: ReviewerTasksApi,
  read: MergeSnapshot,
  before: ReviewerTasks = {},
  settings: ReviewerTaskSettings = live,
): Promise<ReviewerTasks> {
  return await reviewerTasksPass(ctx, {
    companyId: "c",
    repo: "halonic-com/halonic",
    snapshot: read,
    rules: testSettings,
    settings,
    before,
  });
}

verifies("paperclip.merge-control-reviewer-tasks", () => {
  test("a gate waiting for Julian's security sign-off gives Julian exactly one task", async () => {
    const host = fakeHost();
    const read = snapshot({ pulls: [securityPull()] });
    const tasks = await passOf(host.ctx, read);
    await passOf(host.ctx, read, tasks);
    expect(host.create).toHaveBeenCalledTimes(1);
    expect(host.create.mock.calls[0]?.[0]).toMatchObject({
      assigneeAgentId: "agent-julian",
      parentId: "id-HAL-6833",
      projectId: "project-1",
      status: "todo",
      priority: "high",
      title: "Review #6833: Julian's security sign-off",
    });
    expect(host.requestWakeup).toHaveBeenCalledTimes(1);
  });

  test("Nora's approval while she is in shadow gives Liam exactly one task", async () => {
    const host = fakeHost();
    const read = snapshot({ pulls: [noraPull()] });
    const tasks = await passOf(host.ctx, read);
    await passOf(host.ctx, read, tasks);
    expect(host.create).toHaveBeenCalledTimes(1);
    expect(host.create.mock.calls[0]?.[0]).toMatchObject({ assigneeAgentId: "agent-liam" });
    expect(await passOf(fakeHost().ctx, read, {}, { ...live, noraShadow: false })).toEqual({});
  });

  test("nothing is made while something else holds the pull request", async () => {
    const host = fakeHost();
    const conflicting = { mergeable: "CONFLICTING" as const };
    const read = snapshot({ pulls: [securityPull(conflicting), noraPull(conflicting)] });
    await passOf(host.ctx, read);
    expect(host.create).not.toHaveBeenCalled();
  });

  test("the task closes when the sign-off lands or the pull request merges", async () => {
    const host = fakeHost();
    const tasks = await passOf(host.ctx, snapshot({ pulls: [securityPull()] }));
    const signed = securityPull({ texts: [liam(6833), signOff(6833)] });
    expect(await passOf(host.ctx, snapshot({ pulls: [signed] }), tasks)).toEqual({});
    expect(host.update).toHaveBeenCalledWith("task-1", { status: "done" }, "c");

    const other = fakeHost();
    const open = await passOf(other.ctx, snapshot({ pulls: [noraPull()] }));
    expect(await passOf(other.ctx, snapshot({ pulls: [] }), open)).toEqual({});
    expect(other.update).toHaveBeenCalledWith("task-1", { status: "done" }, "c");
  });

  test("a new head wakes the same task, or a new one once the reviewer closed it", async () => {
    const host = fakeHost();
    const tasks = await passOf(host.ctx, snapshot({ pulls: [securityPull()] }));
    const onHead = (head: string) =>
      securityPull({ head, texts: [said(`Liam: approved on head \`${head.slice(0, 7)}\``)] });
    const kept = await passOf(host.ctx, snapshot({ pulls: [onHead(headOf(6833, 1))] }), tasks);
    expect(host.create).toHaveBeenCalledTimes(1);
    expect(host.createComment.mock.calls[0]?.[0]).toBe("task-1");
    expect(host.requestWakeup).toHaveBeenCalledTimes(2);

    host.statuses.set("task-1", "done");
    const again = snapshot({ pulls: [onHead(headOf(6833, 2))] });
    expect(await passOf(host.ctx, again, kept)).toMatchObject({
      "6833:julian": { task: "task-2" },
    });
  });

  test("the dry run writes nothing", async () => {
    const host = fakeHost();
    const dry = { ...live, dryRun: true };
    await passOf(host.ctx, snapshot({ pulls: [securityPull(), noraPull()] }), {}, dry);
    expect(host.create).not.toHaveBeenCalled();
    expect(host.requestWakeup).not.toHaveBeenCalled();
  });
});
