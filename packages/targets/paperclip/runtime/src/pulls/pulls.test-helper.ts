import type { Tool } from "@halonicjs/format";
import { acmeTool } from "../fake-host.test-helper.ts";
import type { GitHubGet } from "../github.ts";
import { type ActionCall, runtimeHandlers } from "../handlers.ts";
import { paperclipAccess } from "../paperclip-access.ts";
import type { CopyComment } from "./approval-copy.ts";

/**
 * The fakes the pull request actions' tests share: an invented `acme`
 * repository on a GitHub reader that answers from a list, and a Paperclip
 * host with acme's agents and the tasks a test gives it.
 */

/** The invented `acme` repository and a pull request on it. */
export const repo = "acme/website";
export const head = "7651f8c1e4af38752f56d353156c5dd19ff54984";
export const pulls = `/repos/${repo}/pulls`;
export const issues = `/repos/${repo}/issues`;
export const ours = { full_name: repo };
export const page = "per_page=100&page=1";

/** A GitHub reader answering from `answers`; any other path answers 404, as GitHub would. */
export function fakeGitHub(answers: Record<string, unknown>) {
  const paths: string[] = [];
  const get: GitHubGet = async (path) => {
    paths.push(path);
    if (!(path in answers)) {
      throw new Error(`GitHub: GET ${path.split("?")[0]} answered 404.`);
    }
    return answers[path];
  };
  return { get, paths };
}

/** One pull request as GitHub's REST API gives it. */
export function pull(number: number, overrides: Record<string, unknown> = {}) {
  return {
    html_url: `https://github.com/${repo}/pull/${number}`,
    title: "feat(checkout): the new checkout",
    state: "open",
    draft: false,
    merged_at: null,
    mergeable: true,
    additions: 120,
    deletions: 30,
    head: { sha: head, ref: "priya/ACME-7-checkout", repo: ours },
    base: { ref: "main", repo: { private: false } },
    ...overrides,
  };
}

/** A `ci-ok` run on the head, or on `sha`. */
export function ciOk(conclusion: string, name = "ci-ok", sha = head) {
  return {
    [`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&per_page=100`]:
      { check_runs: [{ status: "completed", conclusion, started_at: "2026-11-24T10:00:00Z" }] },
  };
}

/** `#12` with what `github.pull-request` reads on top of the pull request itself. */
export function pr12(
  conversation: (string | { body: string; author_association: string })[],
  overrides: Record<string, unknown> = {},
) {
  return {
    [`${pulls}/12`]: pull(12, overrides),
    ...ciOk("success"),
    [`${issues}/12/comments?${page}`]: conversation.map((comment, id) => ({
      id,
      created_at: "2026-11-24T11:00:00Z",
      ...(typeof comment === "string" ? { body: comment, author_association: "MEMBER" } : comment),
    })),
    [`${issues}/12/timeline?${page}`]: [{ event: "added_to_merge_queue" }],
    [`/repos/${repo}/compare/main...${head}`]: { behind_by: 3 },
    [`${pulls}/12/reviews?${page}`]: [],
    [`${pulls}/12/comments?sort=created&direction=desc&per_page=100`]: [],
  };
}

/** The acme company's agents; Liam's `urlKey` isn't his first name. */
export const agents = [
  { id: "agent-mateo", urlKey: "mateo", name: "Mateo" },
  { id: "agent-priya", urlKey: "priya", name: "Priya" },
  { id: "agent-liam", urlKey: "liam-cto", name: "Liam" },
  { id: "agent-julian", urlKey: "julian", name: "Julian" },
];

/** Runs an action's handler as Mateo (or `caller`) would call it, with the tool reading `acme/website`. */
export function run(
  action: "github.pull-request" | "github.open-pull-requests",
  params: unknown,
  github: GitHubGet,
  caller: ActionCall["caller"] = { agentId: "agent-mateo", urlKey: "mateo", name: "Mateo" },
  extra: {
    reviewerRules?: unknown;
    routing?: ActionCall["routing"];
    /** Paperclip's tasks by identifier, with their comments; Paperclip has no other task. */
    tasks?: Record<string, readonly CopyComment[]>;
    /** When set, every Paperclip task read fails with this message. */
    paperclipError?: string;
  } = {},
) {
  const tasks = extra.tasks ?? {};
  const { paperclipError } = extra;
  const handler = runtimeHandlers[action];
  if (handler === undefined) throw new Error(`no handler for ${action}`);
  const call: ActionCall = {
    tool: acmeTool(action === "github.pull-request" ? "pr_status" : "my_prs", {
      action: {
        run: action,
        with: {
          repositories: [repo],
          ...(extra.reviewerRules ? { reviewerRules: extra.reviewerRules } : {}),
        },
      } as Tool["action"],
    }),
    ...(extra.routing === undefined ? {} : { routing: extra.routing }),
    params,
    templates: [],
    caller,
    companyId: "acme",
    github: async () => github,
    githubQuery: async () => {
      throw new Error(`${action} reads GitHub's REST API only`);
    },
    paperclip: paperclipAccess(
      {
        agents: { list: async () => agents },
        issues: {
          get: async (identifier: string) => {
            if (paperclipError !== undefined) throw new Error(paperclipError);
            return identifier in tasks ? { id: identifier } : null;
          },
          listComments: async (id: string) => tasks[id] ?? [],
        },
      } as never,
      handler.capabilities,
      {
        companyId: "acme",
        runId: "run-1",
      },
    ),
    now: new Date("2026-11-24T12:00:00Z"),
  };
  return handler.run(call);
}
