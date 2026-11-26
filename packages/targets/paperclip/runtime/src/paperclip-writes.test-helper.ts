import type { Tool, ToolActionName } from "@halonicjs/format";
import type { ActionCall } from "./handlers.ts";
import { runtimeHandlers } from "./handlers.ts";
import type {
  DispositionPatch,
  DispositionResult,
  IssueRecord,
  PaperclipTask,
  RuntimeHost,
} from "./host.ts";
import { paperclipAccess } from "./paperclip-access.ts";

/** The acme tasks the tests change: Tomas holds HAL-16403; HAL-16989 is Liam's. */
export const task: IssueRecord = {
  id: "task-16403",
  identifier: "HAL-16403",
  status: "in_progress",
  assigneeAgentId: "agent-tomas",
  monitorNextCheckAt: "2026-11-23T21:33:45.000Z",
};
export const blocker: IssueRecord = {
  id: "task-16989",
  identifier: "HAL-16989",
  status: "todo",
  assigneeAgentId: "agent-liam",
};

const agents = [
  { id: "agent-tomas", name: "Tomas", urlKey: "tomas" },
  { id: "agent-liam", name: "Liam", urlKey: "liam" },
];

export const accepted = (body: unknown): DispositionResult => ({ ok: true, status: 200, body });

/** One write the fake host received. */
export interface ReceivedWrite {
  readonly method: "createComment" | "update" | "setDisposition";
  readonly args: readonly unknown[];
}

/** How the fake host behaves: with or without `setDisposition`, and whether a write fails the test. */
export interface FakeHostOptions {
  readonly disposition?: false | ((patch: DispositionPatch) => DispositionResult) | undefined;
  readonly writesAllowed?: boolean;
}

/**
 * Paperclip's issue and agent clients over the two tasks, recording every
 * write. With `writesAllowed: false`, any write throws, so a dry run that
 * reached a write client fails its test.
 */
export function fakePaperclip(options: FakeHostOptions = {}) {
  const received: ReceivedWrite[] = [];
  const write = (method: ReceivedWrite["method"], args: readonly unknown[]) => {
    if (options.writesAllowed === false) {
      throw new Error(`a dry run called ${method}`);
    }
    received.push({ method, args });
  };
  const disposition = options.disposition ?? ((patch) => accepted({ ...task, ...patch }));
  const issues: RuntimeHost["issues"] = {
    // The writing actions read only the fields of `IssueRecord`; the fake has no others.
    get: async (id) =>
      ([task, blocker].find((one) => one.id === id || one.identifier === id) ??
        null) as PaperclipTask | null,
    listComments: async () => [],
    relations: { get: async () => ({ blockedBy: [] }) },
    documents: { list: async () => [], get: async () => null },
    createComment: async (...args) => {
      write("createComment", args);
      return { id: "comment-new" };
    },
    update: async (...args) => {
      write("update", args);
      return { ...task, ...args[1] };
    },
    ...(disposition === false
      ? {}
      : {
          setDisposition: async (...args: [string, string, DispositionPatch]) => {
            write("setDisposition", args);
            return disposition(args[2]);
          },
        }),
  };
  const host = {
    issues,
    agents: { get: async () => null, list: async () => agents },
    projects: { list: async () => [] },
    approvals: { list: async () => [] },
    state: { get: async () => null },
  } as unknown as Pick<RuntimeHost, "issues" | "agents" | "projects" | "approvals" | "state">;
  return { host, received };
}

/** A tool on `action` with `with`, as a workspace's tool file would define it. */
export function writingTool(
  action: ToolActionName,
  settings: Record<string, unknown> | null,
): Tool {
  return {
    version: 1,
    id: "acme-tool",
    name: "acme_tool",
    description: "Acme's writing tool.",
    parameters: {},
    callers: "everyone",
    action: settings === null ? { run: action } : { run: action, with: settings },
  } as unknown as Tool;
}

/**
 * Calls `action` through `runtimeHandlers` as Tomas, with the Paperclip access
 * the runtime gives that handler, at 14:00 on 23 November 2026. `settings`
 * are the tool file's `with`, or null for a tool file without one.
 */
export async function callAction(
  host: Pick<RuntimeHost, "issues" | "agents" | "projects" | "approvals" | "state">,
  action: ToolActionName,
  params: unknown,
  settings: Record<string, unknown> | null = { mode: "write" },
) {
  const handler = runtimeHandlers[action];
  if (handler === undefined) throw new Error(`no handler for ${action}`);
  const call: ActionCall = {
    tool: writingTool(action, settings),
    params,
    caller: { agentId: "agent-tomas", urlKey: "tomas", name: "Tomas" },
    workspaceCommit: "0123456789abcdef0123456789abcdef01234567",
    companyId: "acme",
    templates: [],
    github: async () => {
      throw new Error("a writing action never reads GitHub");
    },
    githubQuery: async () => {
      throw new Error("a writing action never reads GitHub");
    },
    paperclip: paperclipAccess(host, handler.capabilities, { companyId: "acme", runId: "run-1" }),
    now: new Date("2026-11-23T14:00:00Z"),
  };
  try {
    return await handler.run(call);
  } catch (error) {
    return { error: (error as Error).message };
  }
}
