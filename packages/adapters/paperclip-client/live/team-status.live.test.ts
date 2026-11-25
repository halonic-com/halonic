import type { PullRequest, PullRequestState } from "@halonicjs/ports";
import { afterAll, describe, expect, it } from "vitest";
import { findRequest } from "../src/requests.ts";
import { PaperclipTeamStatus } from "../src/team-status.ts";

// Run by `pnpm test:live`, never by `pnpm test`: it reads a real Paperclip server with a board key,
// so CI never runs it. It checks that every route of the architecture note's section 1.5 answers
// and maps with no error, as of the server's Paperclip version. The key comes from the environment
// only, never a command-line argument, and nothing else it reads is printed: the run log names each
// request, its status, how many items mapped, and the public number of the pull request whose
// detail it read, so the timeline can be compared with GitHub.

/**
 * The states whose detail has a timeline step, best first: an open pull request that is waiting for
 * review or approved has none, so picking one would map an empty timeline and prove nothing.
 */
const statesWithSteps: readonly PullRequestState[] = ["in-queue", "dequeued", "failing", "merged"];

/** The first pull request in the best state for a timeline, if any is in one. */
function withTimeline(pulls: readonly PullRequest[]): PullRequest | undefined {
  for (const state of statesWithSteps) {
    const found = pulls.find((pull) => pull.state === state);
    if (found !== undefined) return found;
  }
  return undefined;
}

function required(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") throw new Error(`The live team status check needs ${name}.`);
  return value;
}

/** One request the provider sent, as the run log shows it. */
interface SeenRequest {
  name: string;
  status: number;
}

const address = required("HALONIC_PAPERCLIP_LIVE_ADDRESS");
const key = required("HALONIC_PAPERCLIP_LIVE_KEY");
const company = required("HALONIC_PAPERCLIP_LIVE_COMPANY");
const seen: SeenRequest[] = [];
const mapped: string[] = [];

/** The platform's fetch, noting each request's name on the request list and its answer's status. */
const noting: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : input);
  const name = findRequest(init?.method ?? "GET", url.pathname) ?? "off the list";
  seen.push({ name, status: response.status });
  return response;
};

const team = new PaperclipTeamStatus({ connection: "live", company, address, key, fetch: noting });

describe("the Paperclip provider's TeamStatus on a live server", () => {
  afterAll(() => {
    console.log(["Requests:", ...seen.map((each) => `  ${each.status} ${each.name}`)].join("\n"));
    console.log(["Mapped:", ...mapped.map((line) => `  ${line}`)].join("\n"));
  });

  it("names the server's Paperclip version", async () => {
    // `/api/health` isn't on the request list: the provider never reads it, only this check does.
    // It names the version only to a signed-in caller.
    const response = await fetch(new URL("/api/health", address), {
      headers: { authorization: `Bearer ${key}` },
      redirect: "manual",
    });
    const health: unknown = await response.json();
    const version =
      typeof health === "object" && health !== null && "version" in health
        ? health.version
        : undefined;
    expect(typeof version).toBe("string");
    console.log(`Paperclip version: ${String(version)}`);
  });

  it("maps the company's spend and each agent's spend", async () => {
    const spend = await team.spend("month");
    const agents = await team.agentSpend("month");
    expect(spend).toHaveLength(1);
    expect(agents.length).toBeGreaterThan(0);
    mapped.push(`spend: ${spend.length} summary`, `agent spend: ${agents.length} agents`);
  });

  it("maps the seats, with the seats plugin served", async () => {
    const seats = await team.seats();
    const [parts] = await team.parts();
    expect(parts?.seats).toBe(true);
    // Empty still fails: a served seats plugin with no seats is the fault this check is here to
    // catch (HAL-18334 was one), even though an empty list maps without an error.
    expect(seats.length, "the seats plugin is served but lists no seats").toBeGreaterThan(0);
    mapped.push(`seats: ${seats.length} seats`);
  });

  it("maps the pull requests, the merge queue and one pull request's detail", async () => {
    const lists = await team.pullRequests();
    const queues = await team.mergeQueue();
    const [parts] = await team.parts();
    expect(parts?.pullRequests).toBe(true);
    expect(lists.length).toBeGreaterThan(0);
    expect(queues.length).toBeGreaterThan(0);
    const picked = withTimeline(lists.flatMap((list) => [...list.open, ...list.recent]));
    expect(picked, "no pull request is queued, dequeued, failing or merged").toBeDefined();
    const detail = picked === undefined ? undefined : await team.pullRequest(picked.id);
    expect(detail?.pullRequest.id).toBe(picked?.id);
    expect(detail?.timeline.length, "the picked pull request's timeline").toBeGreaterThan(0);
    const open = lists.reduce((sum, list) => sum + list.open.length, 0);
    mapped.push(
      `pull requests: ${lists.length} repos, ${open} open`,
      `merge queue: ${queues.length} queues`,
      `pull request detail: ${picked?.repo} ${picked?.label} (${picked?.state}), ${detail?.timeline.length ?? 0} timeline events`,
    );
  });

  it("sent only requests on the list, each answered", () => {
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.name, `${request.status} ${request.name}`).not.toBe("off the list");
      expect(request.status, request.name).toBe(200);
    }
  });
});
