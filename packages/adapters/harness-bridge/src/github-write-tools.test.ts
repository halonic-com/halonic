import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { GitHubWriteTools } from "./github-write-tools.ts";
import type { Fetch } from "./pass-through.ts";

const token = "ghp_exampleexampleexample";
const signal = new AbortController().signal;

interface Sent {
  url: string;
  init: RequestInit;
}

/** The tools over a fake GitHub that answers every call with `reply`, and what it was sent. */
function toolsWith(reply: () => Response, secret: string | null = token) {
  const sent: Sent[] = [];
  const fetch: Fetch = async (input, init) => {
    sent.push({ url: String(input), init: init ?? {} });
    return reply();
  };
  const tools = new GitHubWriteTools({
    repository: "halonic-com/halonic",
    secret: "GITHUB_WRITE_TOKEN",
    secrets: { get: async () => secret },
    fetch,
    limits: { timeoutMs: 1000, maxAnswerBytes: 10_000 },
  });
  return { tools, sent };
}

const created = () =>
  new Response(
    JSON.stringify({
      number: 12,
      title: "Add a thing",
      state: "open",
      draft: false,
      html_url: "https://github.com/halonic-com/halonic/pull/12",
      head: { repo: { secret: "no" } },
    }),
    { status: 201 },
  );

const openArgs = { title: "Add a thing", head: "topic", base: "main" };

verifies("harness-bridge.github-write", () => {
  describe("GitHubWriteTools", () => {
    it("lists two tools and none that merges", async () => {
      const { tools } = toolsWith(created);
      const names = (await tools.list()).map((tool) => tool.name);
      expect(names).toEqual(["github_open_pull_request", "github_update_pull_request"]);
    });

    it("sends acceptable calls to a person and refuses any other name", async () => {
      const { tools } = toolsWith(created);
      expect(await tools.check("github_open_pull_request", openArgs)).toEqual({ kind: "ask" });
      expect(await tools.check("github_update_pull_request", { number: 3, body: "" })).toEqual({
        kind: "ask",
      });
      expect(await tools.check("github_merge_pull_request", { number: 3 })).toMatchObject({
        kind: "refused",
      });
    });

    it.each([
      ["a head that names a fork", { ...openArgs, head: "someone:topic" }],
      ["the same head and base", { ...openArgs, head: "main" }],
      ["a branch git refuses", { ...openArgs, head: "a..b" }],
      ["an empty title", { ...openArgs, title: " " }],
      ["an argument the tool doesn't list", { ...openArgs, repo: "other/place" }],
    ])("refuses %s without asking", async (_name, args) => {
      const { tools, sent } = toolsWith(created);
      expect(await tools.check("github_open_pull_request", args)).toMatchObject({
        kind: "refused",
      });
      expect((await tools.call("github_open_pull_request", args, { signal })).outcome).toBe(
        "error",
      );
      expect(sent).toEqual([]);
    });

    it("refuses an update that changes nothing, or whose number isn't one", async () => {
      const { tools } = toolsWith(created);
      expect(await tools.check("github_update_pull_request", { number: 3 })).toMatchObject({
        kind: "refused",
      });
      expect(
        await tools.check("github_update_pull_request", { number: 0, title: "x" }),
      ).toMatchObject({
        kind: "refused",
      });
      expect(
        await tools.check("github_update_pull_request", { number: 3, state: "closed" }),
      ).toMatchObject({ kind: "refused" });
    });

    it("opens a pull request with one POST, signed in with the token", async () => {
      const { tools, sent } = toolsWith(created);
      const answer = await tools.call("github_open_pull_request", openArgs, { signal });
      expect(answer.outcome).toBe("ok");
      expect(JSON.parse(answer.result)).toEqual({
        number: 12,
        title: "Add a thing",
        state: "open",
        draft: false,
        html_url: "https://github.com/halonic-com/halonic/pull/12",
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe("https://api.github.com/repos/halonic-com/halonic/pulls");
      expect(sent[0]?.init.method).toBe("POST");
      expect(sent[0]?.init.redirect).toBe("manual");
      expect(JSON.parse(String(sent[0]?.init.body))).toEqual(openArgs);
      expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe(`Bearer ${token}`);
    });

    it("changes only what an update names", async () => {
      const { tools, sent } = toolsWith(() => new Response(created().body, { status: 200 }));
      const answer = await tools.call(
        "github_update_pull_request",
        { number: 12, title: "New" },
        { signal },
      );
      expect(answer.outcome).toBe("ok");
      expect(sent[0]?.url).toBe("https://api.github.com/repos/halonic-com/halonic/pulls/12");
      expect(sent[0]?.init.method).toBe("PATCH");
      expect(JSON.parse(String(sent[0]?.init.body))).toEqual({ title: "New" });
    });

    it("names only the status when GitHub refuses, never its words or the token", async () => {
      const { tools } = toolsWith(() => new Response(`bad ${token}`, { status: 422 }));
      const answer = await tools.call("github_open_pull_request", openArgs, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("422");
      expect(answer.result).not.toContain(token);
      expect(answer.result).not.toContain("bad");
    });

    it("doesn't call GitHub when the secret isn't set, and names the secret", async () => {
      const { tools, sent } = toolsWith(created, null);
      const answer = await tools.call("github_open_pull_request", openArgs, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("GITHUB_WRITE_TOKEN");
      expect(sent).toEqual([]);
    });

    it("says only that GitHub could not be reached when the network fails", async () => {
      const tools = new GitHubWriteTools({
        repository: "halonic-com/halonic",
        secret: "GITHUB_WRITE_TOKEN",
        secrets: { get: async () => token },
        fetch: async () => {
          throw new Error(`connect failed for ${token}`);
        },
      });
      const answer = await tools.call("github_open_pull_request", openArgs, { signal });
      expect(answer).toEqual({ result: "GitHub could not be reached.", outcome: "error" });
    });

    it("refuses a repository that isn't owner/name", () => {
      expect(
        () =>
          new GitHubWriteTools({
            repository: "../x",
            secret: "S",
            secrets: { get: async () => null },
          }),
      ).toThrow(RangeError);
    });
  });
});
