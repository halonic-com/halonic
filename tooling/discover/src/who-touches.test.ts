import { describe, expect, test } from "vitest";
import {
  type Fetch,
  fetchOpenPullRequests,
  repoFromRemote,
  resolvePackage,
  touchesByPackage,
} from "./who-touches.ts";

const packages = [
  { name: "@halonicjs/engine", directory: "packages/core/engine" },
  { name: "@halonicjs/engine-tools", directory: "packages/core/engine-tools" },
  { name: "@halonicjs/studio-feature-agents", directory: "packages/studio/features/agents" },
  { name: "@halonicjs/target-node-runtime", directory: "packages/targets/node/runtime" },
  {
    name: "@halonicjs/target-cloudflare-runtime",
    directory: "packages/targets/cloudflare/runtime",
  },
];

/** A fake GitHub: answers each path with the items for the requested page. */
function fakeGitHub(pages: Record<string, unknown[]>, seen: string[] = []): Fetch {
  return async (url, init) => {
    seen.push(`${url} ${init.headers["authorization"] ?? "anonymous"}`);
    const { pathname, searchParams } = new URL(url);
    const all = pages[pathname];
    if (all === undefined) {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 });
    }
    const page = Number(searchParams.get("page"));
    const size = Number(searchParams.get("per_page"));
    return new Response(JSON.stringify(all.slice((page - 1) * size, page * size)));
  };
}

const pull = (number: number) => ({ number, title: `PR ${number}`, head: { ref: `b/${number}` } });

describe("fetchOpenPullRequests", () => {
  test("pages through more than 100 pull requests and more than 100 files", async () => {
    const pulls = Array.from({ length: 101 }, (_, index) => pull(index + 1));
    const pages: Record<string, unknown[]> = { "/repos/o/r/pulls": pulls };
    for (const { number } of pulls) {
      pages[`/repos/o/r/pulls/${number}/files`] = [{ filename: `f${number}.ts` }];
    }
    pages["/repos/o/r/pulls/7/files"] = Array.from({ length: 250 }, (_, index) => ({
      filename: `packages/core/engine/${index}.ts`,
    }));
    const result = await fetchOpenPullRequests("o/r", { fetch: fakeGitHub(pages) });
    expect(result).toHaveLength(101);
    expect(result.find((item) => item.number === 7)?.files).toHaveLength(250);
    expect(result[0]).toEqual({
      number: 1,
      title: "PR 1",
      headRefName: "b/1",
      files: [{ path: "f1.ts" }],
    });
  });

  test("counts both sides of a rename", async () => {
    const pages = {
      "/repos/o/r/pulls": [pull(1)],
      "/repos/o/r/pulls/1/files": [{ filename: "b/x.ts", previous_filename: "a/x.ts" }],
    };
    const [only] = await fetchOpenPullRequests("o/r", { fetch: fakeGitHub(pages) });
    expect(only?.files).toEqual([{ path: "b/x.ts" }, { path: "a/x.ts" }]);
  });

  test("works without a token and sends GH_TOKEN when there is one", async () => {
    const pages = { "/repos/o/r/pulls": [] };
    const seen: string[] = [];
    await fetchOpenPullRequests("o/r", { fetch: fakeGitHub(pages, seen) });
    await fetchOpenPullRequests("o/r", { fetch: fakeGitHub(pages, seen), token: "t" });
    expect(seen.map((line) => line.split(" ")[1])).toEqual(["anonymous", "Bearer"]);
  });

  test("shows GitHub's own error", async () => {
    const pages = { "/repos/o/r/pulls": [pull(1)] };
    await expect(fetchOpenPullRequests("o/r", { fetch: fakeGitHub(pages) })).rejects.toThrow(
      /403 .*pulls\/1\/files.*API rate limit exceeded/,
    );
  });
});

describe("repoFromRemote", () => {
  test("reads owner/name from HTTPS and SSH remotes", () => {
    expect(repoFromRemote("https://github.com/halonic-com/halonic.git\n")).toBe(
      "halonic-com/halonic",
    );
    expect(repoFromRemote("git@github.com:halonic-com/halonic.git")).toBe("halonic-com/halonic");
    expect(repoFromRemote("https://example.com/a/b.git")).toBeUndefined();
  });
});

describe("touchesByPackage", () => {
  test("lists each pull request once per package it changes", () => {
    const pullRequest = {
      number: 7,
      title: "feat(agents): filter by hub",
      headRefName: "elena/HAL-42-agent-filter",
      files: [
        { path: "packages/studio/features/agents/src/a.ts" },
        { path: "packages/studio/features/agents/src/b.ts" },
        { path: "pnpm-lock.yaml" },
      ],
    };
    const ownerOf = (file: string): string =>
      file.startsWith("packages/studio/features/agents/")
        ? "@halonicjs/studio-feature-agents"
        : "@halonicjs/root";
    const touches = touchesByPackage([pullRequest], ownerOf);
    expect(touches.get("@halonicjs/studio-feature-agents")).toEqual([pullRequest]);
    expect(touches.get("@halonicjs/root")).toEqual([pullRequest]);
    expect(touches.has("@halonicjs/engine")).toBe(false);
  });
});

describe("resolvePackage", () => {
  test("finds a package by name, folder or last part", () => {
    expect(resolvePackage("@halonicjs/engine", packages)).toEqual([packages[0]]);
    expect(resolvePackage("packages/core/engine/", packages)).toEqual([packages[0]]);
    expect(resolvePackage("agents", packages)).toEqual([packages[2]]);
    expect(resolvePackage("nothing", packages)).toEqual([]);
  });

  test("returns every package a shared last part could mean", () => {
    expect(resolvePackage("runtime", packages).map((pkg) => pkg.name)).toEqual([
      "@halonicjs/target-node-runtime",
      "@halonicjs/target-cloudflare-runtime",
    ]);
    expect(resolvePackage("packages/targets/node/runtime", packages)).toHaveLength(1);
  });
});
