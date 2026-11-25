import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { gitHubQueryReader, isReadOnlyQuery, type QueryFetch } from "./github.ts";

/** A fetch that records each request and answers `body`, following a redirect unless told not to. */
function recordingFetch(body: unknown, status = 200) {
  const sent: { url: string; method: string; redirect: string; query: string }[] = [];
  const fetch: QueryFetch = async (url, init) => {
    sent.push({
      url,
      method: init.method,
      redirect: init.redirect,
      query: (JSON.parse(init.body) as { query: string }).query,
    });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, sent };
}

verifies("runtime.tools", () => {
  describe("the GraphQL reader", () => {
    test("posts a query to api.github.com/graphql only, with the token, without following a redirect", async () => {
      const { fetch, sent } = recordingFetch({ data: { repository: null } });
      const query = gitHubQueryReader({ fetch, token: "test-token" });
      expect(await query("query Q { viewer { login } }", {})).toEqual({ repository: null });
      expect(sent).toEqual([
        {
          url: "https://api.github.com/graphql",
          method: "POST",
          redirect: "error",
          query: "query Q { viewer { login } }",
        },
      ]);
    });

    test("refuses a mutation or a subscription before sending anything", async () => {
      const { fetch, sent } = recordingFetch({ data: {} });
      const query = gitHubQueryReader({ fetch, token: "test-token" });
      for (const document of [
        "mutation M { enqueuePullRequest(input: {}) { clientMutationId } }",
        "query Q { viewer { login } } mutation M { addLabelsToLabelable(input: {}) { clientMutationId } }",
        "subscription S { x }",
        "{ viewer { login } }",
      ]) {
        await expect(query(document, {})).rejects.toThrow(
          "GitHub: refusing a GraphQL document that isn't a query.",
        );
      }
      expect(sent).toEqual([]);
    });

    test("ignores a comment that names a mutation", () => {
      expect(isReadOnlyQuery("# no mutation here\nquery Q { viewer { login } }")).toBe(true);
    });

    test("fails on GitHub's errors, even with a partial answer, and on a refused request", async () => {
      const partial = recordingFetch({
        data: { repository: {} },
        errors: [{ message: "timeout" }],
      });
      await expect(gitHubQueryReader(partial)("query Q { x }", {})).rejects.toThrow(
        "GitHub: the GraphQL query answered 200: timeout.",
      );
      const refused = recordingFetch({ message: "Bad credentials" }, 401);
      await expect(gitHubQueryReader(refused)("query Q { x }", {})).rejects.toThrow(
        "GitHub: the GraphQL query answered 401.",
      );
    });
  });
});
