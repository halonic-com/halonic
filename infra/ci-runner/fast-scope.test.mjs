// The fast pool's PR_SCOPE (HAL-17654): the VM-side switch that lets the hook admit pull requests
// without the fast-track label, once the board sets CI_FAST_SCOPE to "all". Everything else the
// hook checks stays: our own branch, open, at the event's commit, opened by a person.
import assert from "node:assert/strict";
import { test } from "node:test";
import { events, POOL_FAST, REPO, read, refused, run, SHA } from "./hook-run.mjs";

const PR_ENV = {
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@refs/pull/42/merge`,
};
// Pull request #42 as the gate returns it, without labels unless `patch` adds some.
const livePr = (patch = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 42,
          state: "OPEN",
          isCrossRepository: false,
          headRefOid: SHA,
          headRefName: "acme/HAL-42-scope",
          headRepositoryOwner: { login: "halonic-com" },
          labels: { nodes: [] },
          author: { __typename: "User", login: "halonic-dev" },
          ...patch,
        },
      },
    },
  });
const fast = (scopeLine, patch) =>
  run({
    pool: `${POOL_FAST}${scopeLine}`,
    event: events.fastPr,
    env: PR_ENV,
    gate: { status: 200, body: livePr(patch) },
  });

test("fast scope: without PR_SCOPE, or with any value but all, the label is still required", () => {
  for (const line of [
    "",
    'PR_SCOPE="fast-track"\n',
    'PR_SCOPE="ALL"\n',
    'PR_SCOPE=""\n',
    'PR_SCOPE="all "\n',
  ]) {
    refused(fast(line), /#42 has no fast-track label/);
  }
});

test('fast scope: PR_SCOPE="all" admits an unlabelled pull request a person opened from our branch', () => {
  const res = fast('PR_SCOPE="all"\n');
  assert.equal(res.ok, true, res.out);
  assert.match(res.out, /halonic-ci: accepted pull_request/);
});

test('fast scope: PR_SCOPE="all" still refuses bots, forks, closed and moved-on pull requests', () => {
  const all = 'PR_SCOPE="all"\n';
  refused(fast(all, { author: { __typename: "Bot", login: "renovate" } }), /not a person/);
  refused(fast(all, { author: { __typename: "User", login: "dependabot[bot]" } }), /by the bot /);
  refused(fast(all, { isCrossRepository: true }), /comes from outside halonic-com/);
  refused(fast(all, { state: "CLOSED" }), /is not open/);
  refused(fast(all, { headRefOid: "f".repeat(40) }), /no longer at/);
  refused(fast(all, { headRefName: "dependabot/npm/acme" }), /comes from a bot branch/);
});

test("fast scope: the shipped fast pool config keeps the label required", () => {
  assert.match(read("vm/pool-fast.conf"), /^PR_SCOPE="fast-track"$/m);
});
