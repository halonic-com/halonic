import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { GitHubReadTools } from "./github-read-tools.ts";
import type { Fetch } from "./pass-through.ts";

const token = "ghp_exampleexampleexample";
const signal = new AbortController().signal;

interface Sent {
  url: string;
  init: RequestInit;
}

/** The tools over a fake GitHub that answers each path with `replies`, and what it was sent. */
function toolsWith(
  replies: Record<string, Response>,
  options: { secret?: string | null; maxResultBytes?: number } = {},
) {
  const sent: Sent[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = String(input);
    sent.push({ url, init: init ?? {} });
    return (
      replies[url.replace("https://api.github.com", "")] ?? new Response("{}", { status: 404 })
    );
  };
  const secret = options.secret === undefined ? token : options.secret;
  const tools = new GitHubReadTools({
    repository: "halonic-com/halonic",
    secret: "GITHUB_READ_TOKEN",
    secrets: { get: async () => secret },
    fetch,
    limits: { timeoutMs: 1000, maxResultBytes: options.maxResultBytes ?? 10_000 },
  });
  return { tools, sent };
}

const json = (value: unknown) => new Response(JSON.stringify(value));

const pull = {
  number: 12,
  title: "Add a thing",
  state: "open",
  user: { login: "someone" },
  base: { ref: "main", sha: "a".repeat(40), repo: { secret: "no" } },
  head: { ref: "topic", sha: "b".repeat(40) },
  body: "Why",
};

verifies("harness-bridge.github-read", () => {
  describe("GitHubReadTools", () => {
    it("lists four read tools, each taking a pull request number", async () => {
      const { tools } = toolsWith({});
      const listed = await tools.list();
      expect(listed.map((tool) => tool.name)).toEqual([
        "github_get_pull_request",
        "github_get_pull_request_diff",
        "github_list_pull_request_files",
        "github_get_pull_request_checks",
      ]);
      for (const tool of listed) expect(tool.parameters).toMatchObject({ required: ["number"] });
    });

    it("lets its own tools run and refuses any other name", async () => {
      const { tools } = toolsWith({});
      expect(await tools.check("github_get_pull_request", {})).toEqual({ kind: "run" });
      expect(await tools.check("github_merge_pull_request", {})).toMatchObject({ kind: "refused" });
    });

    it("reads a pull request with only the fields it names, signed in with the token", async () => {
      const { tools, sent } = toolsWith({ "/repos/halonic-com/halonic/pulls/12": json(pull) });
      const answer = await tools.call("github_get_pull_request", { number: 12 }, { signal });
      expect(answer.outcome).toBe("ok");
      expect(JSON.parse(answer.result)).toMatchObject({
        number: 12,
        title: "Add a thing",
        author: "someone",
        head: { ref: "topic", sha: "b".repeat(40) },
      });
      expect(answer.result).not.toContain("secret");
      expect(sent).toHaveLength(1);
      expect(sent[0]?.init.method).toBe("GET");
      expect(sent[0]?.init.redirect).toBe("manual");
      expect(sent[0]?.init.headers).toMatchObject({ authorization: `Bearer ${token}` });
    });

    it("reads the diff as text", async () => {
      const diff = "diff --git a/x b/x\n+line\n";
      const { tools, sent } = toolsWith({
        "/repos/halonic-com/halonic/pulls/12": new Response(diff),
      });
      const answer = await tools.call("github_get_pull_request_diff", { number: 12 }, { signal });
      expect(answer).toEqual({ result: diff, outcome: "ok" });
      expect(sent[0]?.init.headers).toMatchObject({ accept: "application/vnd.github.diff" });
    });

    it("lists the changed files", async () => {
      const files = [
        { filename: "a.ts", status: "added", additions: 3, deletions: 0, patch: "@@" },
      ];
      const { tools } = toolsWith({
        "/repos/halonic-com/halonic/pulls/12/files?per_page=100": json(files),
      });
      const answer = await tools.call("github_list_pull_request_files", { number: 12 }, { signal });
      expect(JSON.parse(answer.result)).toEqual({
        files: [{ filename: "a.ts", status: "added", additions: 3, deletions: 0 }],
        truncated: false,
      });
    });

    it("says a file list may be cut when it fills the page of 100", async () => {
      const files = Array.from({ length: 100 }, (_, index) => ({
        filename: `f${index}.ts`,
        status: "added",
      }));
      const { tools } = toolsWith(
        { "/repos/halonic-com/halonic/pulls/12/files?per_page=100": json(files) },
        { maxResultBytes: 100_000 },
      );
      const answer = await tools.call("github_list_pull_request_files", { number: 12 }, { signal });
      expect(JSON.parse(answer.result)).toMatchObject({ truncated: true });
    });

    it("lists the checks of the head commit", async () => {
      const sha = "b".repeat(40);
      const { tools } = toolsWith({
        "/repos/halonic-com/halonic/pulls/12": json(pull),
        [`/repos/halonic-com/halonic/commits/${sha}/check-runs?per_page=100`]: json({
          check_runs: [{ name: "ci-ok", status: "completed", conclusion: "success", output: "x" }],
        }),
      });
      const answer = await tools.call("github_get_pull_request_checks", { number: 12 }, { signal });
      expect(JSON.parse(answer.result)).toMatchObject({
        sha,
        checks: [{ name: "ci-ok", status: "completed", conclusion: "success" }],
        truncated: false,
      });
    });

    it("says a check list is cut when GitHub holds more checks than it sent", async () => {
      const sha = "b".repeat(40);
      const { tools } = toolsWith({
        "/repos/halonic-com/halonic/pulls/12": json(pull),
        [`/repos/halonic-com/halonic/commits/${sha}/check-runs?per_page=100`]: json({
          total_count: 130,
          check_runs: [{ name: "ci-ok", status: "completed", conclusion: "success" }],
        }),
      });
      const answer = await tools.call("github_get_pull_request_checks", { number: 12 }, { signal });
      expect(JSON.parse(answer.result)).toMatchObject({ truncated: true });
    });

    it("cuts a result over the limit and says so", async () => {
      const { tools } = toolsWith(
        { "/repos/halonic-com/halonic/pulls/12": new Response("x".repeat(100)) },
        { maxResultBytes: 10 },
      );
      const answer = await tools.call("github_get_pull_request_diff", { number: 12 }, { signal });
      expect(answer.outcome).toBe("ok");
      expect(answer.result.startsWith("xxxxxxxxxx\n[Cut:")).toBe(true);
    });

    it("reads no more of a long answer than the limit", async () => {
      let pulled = 0;
      const chunk = new TextEncoder().encode("x".repeat(1000));
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
      });
      const { tools } = toolsWith(
        { "/repos/halonic-com/halonic/pulls/12": new Response(body) },
        { maxResultBytes: 2500 },
      );
      const answer = await tools.call("github_get_pull_request_diff", { number: 12 }, { signal });
      expect(answer.result).toContain("[Cut:");
      expect(pulled).toBeLessThan(10);
    });

    it("answers an error for a JSON answer longer than the limit", async () => {
      const { tools } = toolsWith(
        { "/repos/halonic-com/halonic/pulls/12": json({ title: "x".repeat(100) }) },
        { maxResultBytes: 10 },
      );
      const answer = await tools.call("github_get_pull_request", { number: 12 }, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("longer than");
    });

    it("answers a bad number without calling GitHub", async () => {
      const { tools, sent } = toolsWith({});
      for (const number of [0, -1, 1.5, "12", undefined]) {
        const answer = await tools.call("github_get_pull_request", { number }, { signal });
        expect(answer.outcome).toBe("error");
      }
      expect(sent).toEqual([]);
    });

    it("tells a missing pull request from a refused token, without GitHub's words", async () => {
      const { tools } = toolsWith({
        "/repos/halonic-com/halonic/pulls/1": new Response(`bad ${token}`, { status: 401 }),
      });
      const refused = await tools.call("github_get_pull_request", { number: 1 }, { signal });
      const missing = await tools.call("github_get_pull_request", { number: 2 }, { signal });
      expect(refused.result).toContain("401");
      expect(missing.result).toContain("404");
      expect(refused.result).not.toContain(token);
    });

    it("does not follow a redirect", async () => {
      const { tools, sent } = toolsWith({
        "/repos/halonic-com/halonic/pulls/1": new Response(null, {
          status: 302,
          headers: { location: "https://elsewhere.example/" },
        }),
      });
      const answer = await tools.call("github_get_pull_request", { number: 1 }, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("redirect");
      expect(sent).toHaveLength(1);
    });

    it("answers an error, never the token, when the secret is missing or unusable", async () => {
      for (const secret of [null, "line\nbreak"]) {
        const { tools, sent } = toolsWith({}, { secret });
        const answer = await tools.call("github_get_pull_request", { number: 1 }, { signal });
        expect(answer.outcome).toBe("error");
        expect(answer.result).toContain("GITHUB_READ_TOKEN");
        expect(answer.result).not.toContain("line");
        expect(sent).toEqual([]);
      }
    });

    it("gives the secret store's own message when it fails to read the secret", async () => {
      const tools = new GitHubReadTools({
        repository: "halonic-com/halonic",
        secret: "GITHUB_READ_TOKEN",
        secrets: {
          get: async () => {
            throw new Error("The keychain is locked.");
          },
        },
        fetch: async () => new Response("{}"),
      });
      const answer = await tools.call("github_get_pull_request", { number: 1 }, { signal });
      expect(answer).toEqual({
        outcome: "error",
        result: 'The secret "GITHUB_READ_TOKEN" could not be read: The keychain is locked.',
      });
    });

    it("hides a network failure's own text, which could quote the request", async () => {
      const tools = new GitHubReadTools({
        repository: "halonic-com/halonic",
        secret: "GITHUB_READ_TOKEN",
        secrets: { get: async () => token },
        fetch: async () => {
          throw new Error(`failed with Bearer ${token}`);
        },
      });
      const answer = await tools.call("github_get_pull_request", { number: 1 }, { signal });
      expect(answer).toEqual({ result: "GitHub could not be reached.", outcome: "error" });
    });

    it("refuses a repository that isn't owner/name", () => {
      for (const repository of ["halonic", "a/b/c", "a b/c", "../x"]) {
        expect(
          () =>
            new GitHubReadTools({ repository, secret: "S", secrets: { get: async () => null } }),
        ).toThrow(RangeError);
      }
    });
  });
});
