// The fast pool (HAL-15972): a pull request runs on our CI server only on a fast slot, only from a
// halonic-com/halonic branch, only while it's open and labelled fast-track at job start (the VM's
// gate says so, not the event), and only with the shared caches read-only. These tests run the
// hook as shipped (hook-run.mjs) and the gate's script against a stub curl.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  dir,
  events,
  here,
  hookNoGate,
  mounts,
  POOL_FAST,
  POOL_PUSH,
  POOL_QUEUE,
  REPO,
  read,
  refused,
  run,
  SHA,
} from "./hook-run.mjs";

const PR_ENV = {
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@refs/pull/42/merge`,
};
// Pull request #42 as GitHub's GraphQL API returns it now; `patch` changes its fields.
const livePr = (patch = {}) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number: 42,
          state: "OPEN",
          isCrossRepository: false,
          headRefOid: SHA,
          headRepositoryOwner: { login: "halonic-com" },
          labels: { nodes: [{ name: "area:ci" }, { name: "fast-track" }] },
          ...patch,
        },
      },
    },
  });
const NO_LABEL = { labels: { nodes: [{ name: "area:ci" }] } };
const FORK = { isCrossRepository: true, headRepositoryOwner: { login: "someone" } };
const forkEvent = {
  ...events.fastPr,
  pull_request: {
    ...events.fastPr.pull_request,
    head: { sha: SHA, repo: { full_name: "someone/halonic" } },
  },
};
const fast = ({ pool = POOL_FAST, event = events.fastPr, env = PR_ENV, gate, mountinfo } = {}) =>
  run({ pool, event, env, gate: gate ?? { status: 200, body: livePr() }, mountinfo });

test("fast pool: accepts an open own-branch pull request labelled fast-track, checked at job start", () => {
  const res = fast();
  assert.equal(res.ok, true, res.out);
  assert.match(res.out, /halonic-ci: accepted pull_request/);
  assert.deepEqual(res.asked, ["/pr/42"]);
});

test("fast pool: refuses a fork pull request with the label, whatever its event says", () => {
  refused(fast({ event: forkEvent }), /pull request from someone\/halonic/);
  // The event claims our own branch, the gate knows better.
  refused(
    fast({ gate: { status: 200, body: livePr(FORK) } }),
    /#42 comes from outside halonic-com/,
  );
  // Not cross-repository but owned elsewhere, or the fields missing: not a pass.
  const owner = { headRepositoryOwner: { login: "someone" } };
  refused(fast({ gate: { status: 200, body: livePr(owner) } }), /comes from outside halonic-com/);
  const missing = { isCrossRepository: null, headRepositoryOwner: null };
  refused(fast({ gate: { status: 200, body: livePr(missing) } }), /comes from outside halonic-com/);
});

test("fast pool: refuses an own-branch pull request without the label", () => {
  refused(fast({ gate: { status: 200, body: livePr(NO_LABEL) } }), /#42 has no fast-track label/);
  refused(fast({ gate: { status: 200, body: livePr({ labels: null }) } }), /no fast-track label/);
});

test("fast pool: the label as it is at job start counts, not as it was when the run started", () => {
  // A maintainer approved a fork's run, then someone added the label: still a fork.
  refused(
    fast({ event: forkEvent, gate: { status: 200, body: livePr(FORK) } }),
    /someone\/halonic/,
  );
  // Labelled when the run started, removed before this job started: refused.
  refused(fast({ gate: { status: 200, body: livePr(NO_LABEL) } }), /no fast-track label/);
  // Added after the run started (the event has no labels at all): the gate's answer decides.
  assert.equal(fast().ok, true);
});

test("fast pool: refuses a closed or moved-on pull request, or an answer about another one", () => {
  refused(fast({ gate: { status: 200, body: livePr({ state: "MERGED" }) } }), /#42 is not open/);
  refused(fast({ gate: { status: 200, body: livePr({ state: "CLOSED" }) } }), /#42 is not open/);
  const moved = livePr({ headRefOid: "f".repeat(40) });
  refused(fast({ gate: { status: 200, body: moved } }), /#42 is no longer at a{40}/);
  refused(fast({ gate: { status: 200, body: livePr({ number: 43 }) } }), /another pull request/);
});

test("fast pool: the same pull request's job is refused on a large or small slot", () => {
  refused(fast({ pool: POOL_PUSH }), /event pull_request is off on this pool/);
  refused(fast({ pool: POOL_QUEUE }), /event pull_request is off on this pool/);
  // Even a large or small pool config that lists pull_request isn't the fast pool.
  for (const pool of [
    'ALLOWED_EVENTS="push pull_request"\n',
    'POOL="large"\nALLOWED_EVENTS="pull_request"\n',
  ]) {
    const res = fast({ pool });
    refused(res, /on a pool that takes no pull requests/);
    assert.deepEqual(res.asked, [], "the hook asked the gate before refusing");
  }
});

test("fast pool: fails closed when the gate is down or GitHub's API fails", () => {
  refused(
    run({ pool: POOL_FAST, event: events.fastPr, env: PR_ENV, script: hookNoGate }),
    /queue gate not available/,
  );
  refused(fast({ gate: { status: 502, body: "" } }), /queue gate did not answer after 3 tries/);
  // A failed call is asked again (HAL-15994); the answer then decides, a fork still refused.
  const fail = { status: 502, body: '{"error":"GitHub API call failed"}' };
  const retried = fast({ gate: [fail, { status: 200, body: livePr() }] });
  assert.equal(retried.ok, true, retried.out);
  assert.deepEqual(retried.asked, ["/pr/42", "/pr/42"]);
  refused(fast({ gate: [fail, { status: 200, body: livePr(FORK) }] }), /outside halonic-com/);
  const errors = JSON.stringify({ errors: [{ message: "rate limited" }] });
  refused(fast({ gate: { status: 200, body: errors } }), /GitHub API errors/);
  const none = JSON.stringify({ data: { repository: { pullRequest: null } } });
  refused(fast({ gate: { status: 200, body: none } }), /#42 not found/);
  refused(fast({ gate: { status: 200, body: "{}" } }), /#42 not found/);
  refused(fast({ gate: { status: 200, body: "not json" } }), /queue gate answer unreadable/);
});

test("fast pool: refuses a malformed event, another workflow or pull_request_target", () => {
  const pr = events.fastPr.pull_request;
  for (const [patch, reason] of [
    [{ number: "42; x" }, /pull request number /],
    [{ number: undefined }, /pull request number /],
    [{ head: { ...pr.head, sha: "a".repeat(39) } }, /pull request commit /],
    [{ base: { repo: { full_name: "someone/halonic" } } }, /pull request into someone\/halonic/],
  ]) {
    refused(fast({ event: { ...events.fastPr, pull_request: { ...pr, ...patch } } }), reason);
  }
  const rogue = {
    ...PR_ENV,
    GITHUB_WORKFLOW_REF: PR_ENV.GITHUB_WORKFLOW_REF.replace("ci.yml", "x.yml"),
  };
  refused(fast({ env: rogue }), /workflow /);
  const target = { ...PR_ENV, GITHUB_EVENT_NAME: "pull_request_target" };
  refused(fast({ env: target }), /does not match the event \(pull_request\)/);
});

test("fast pool: refuses a job that sees a shared cache read-write (C2/C8)", () => {
  assert.equal(fast({ mountinfo: mounts("ro") }).ok, true);
  refused(fast({ mountinfo: mounts("rw") }), /shared cache \/cache\/pnpm-store is not read-only/);
  // Not mounted at all is doubt, too.
  refused(fast({ mountinfo: "" }), /shared cache \/cache\/pnpm-store is not read-only/);
  const oneRw = mounts("overlay").replace(/^.*\/cache\/turbo.*$/m, mounts("rw").split("\n")[1]);
  refused(fast({ mountinfo: oneRw }), /shared cache \/cache\/turbo is not read-only/);
  // Under gVisor every mount shows as 9p; the slot script checks the overlay on the VM instead.
  assert.equal(fast({ mountinfo: mounts("9p") }).ok, true);
});

test("fast pool: fast slots run under gVisor, on their own network, with their own gate socket", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(
    slot.includes(
      'SANDBOX=(--runtime=runsc --network="$FAST_NET"); GATE_DIR=/run/halonic-ci-gate-fast',
    ),
  );
  assert.ok(slot.includes('--security-opt no-new-privileges "${SANDBOX[@]}" \\'));
  assert.ok(
    slot.includes('[ "$(findmnt -n -o FSTYPE --mountpoint "$OVL_MNT/$c")" = overlay ] || fail'),
  );
  const socket = read("vm/halonic-ci-gate-fast.socket");
  assert.match(socket, /^ListenStream=\/run\/halonic-ci-gate-fast\/gate\.sock$/m);
  assert.match(socket, /^MaxConnections=4$/m);
  assert.match(socket, /^PollLimitBurst=10$/m);
  const unit = read("vm/halonic-ci-gate-fast@.service");
  assert.match(unit, /^ExecStart=\/usr\/local\/sbin\/halonic-ci-gate\.sh --pr-only$/m);
  // The same sandboxing as the merge queue's gate, apart from the description and the mode.
  const strip = (text) => text.replace(/^(Description|ExecStart)=.*$/gm, "");
  assert.equal(strip(unit), strip(read("vm/halonic-ci-gate@.service")));
});

test("fast pool: fast slots get their own pool config and the shared caches only as overlays", () => {
  const conf = read("vm/pool-fast.conf");
  assert.match(conf, /^POOL="fast"$/m);
  assert.match(conf, /^ALLOWED_EVENTS="pull_request"$/m);
  assert.doesNotMatch(read("vm/pool.conf"), /^(POOL=|ALLOWED_EVENTS=.*pull_request)/m);
  const slot = read("vm/halonic-runner-slot.sh");
  assert.match(slot, /^ {2}fast-\*\) POOL_DIR=\/etc\/halonic-ci\/pool-fast$/m);
  assert.ok(slot.includes(`grep -qx 'POOL="fast"' "$POOL_DIR/pool.conf" || fail`));
  assert.ok(slot.includes("grep -Eq '^(POOL=.*fast|ALLOWED_EVENTS=.*pull_request)'"));
  // The shared folder is the overlay's lower layer, read-only; the container mounts the overlay.
  assert.ok(slot.includes('"lowerdir=$TRUSTED/$c,upperdir=$OVL/$c/upper,workdir=$OVL/$c/work"'));
  assert.ok(slot.includes("  CACHE_SRC=$OVL_MNT\nfi"));
  assert.match(slot, /if \[ "\$LABEL" = halonic-ci-fast \]; then\n {2}for c in \$CACHES/);
  assert.doesNotMatch(slot, /-v "\$TRUSTED\//);
  for (const cache of ["pnpm-store", "turbo", "ms-playwright"]) {
    assert.ok(slot.includes(`-v "$CACHE_SRC/${cache}:/cache/${cache}"`), cache);
  }
});

// Runs the VM's gate with a stub curl that logs the query it was sent, for request line `first`.
// Returns "" when the gate asked GitHub nothing.
const gateQuery = (first, args = []) => {
  const bin = mkdtempSync(join(dir, "fast-gate-bin-"));
  const creds = mkdtempSync(join(dir, "fast-gate-creds-"));
  writeFileSync(join(creds, "github-token"), "github_pat_TEST123\n");
  const log = join(bin, "curl.log");
  writeFileSync(join(bin, "curl"), `#!/bin/bash\necho "$*" >> ${log}\nprintf '{}'\n`, {
    mode: 0o755,
  });
  const res = spawnSync("/bin/bash", [join(here, "vm/halonic-ci-gate.sh"), ...args], {
    encoding: "utf8",
    input: `${first}\r\nHost: halonic-ci-gate\r\n\r\n`,
    env: { PATH: `${bin}:${process.env.PATH}`, CREDENTIALS_DIRECTORY: creds },
  });
  assert.equal(res.status, 0, res.stderr);
  return existsSync(log) ? readFileSync(log, "utf8") : "";
};

test("fast pool: the gate asks about the pull request only for a plain number", () => {
  const asked = gateQuery("GET /pr/42 HTTP/1.1");
  assert.match(asked, /pullRequest\(number: 42\) \{ number state isCrossRepository headRefOid /);
  assert.match(asked, /labels\(first: 100\) \{ nodes \{ name \} \}/);
  assert.doesNotMatch(asked, /mergeQueue/);
  // Anything else gets the merge queue's fixed query: nothing else reaches it.
  for (const first of [
    "GET /pr/0 HTTP/1.1",
    "GET /pr/1234567890 HTTP/1.1",
    "GET /pr/42) { x } HTTP/1.1",
    "GET /pr/42 HTTP/1.1 x",
    "POST /pr/42 HTTP/1.1",
    "GET /queue HTTP/1.1",
  ]) {
    const query = gateQuery(first);
    assert.match(query, /mergeQueue\(branch: \\"main\\"\)/, first);
    assert.doesNotMatch(query, /pullRequest\(number/, first);
  }
});

test("fast pool: the fast slots' gate socket answers pull request queries only", () => {
  assert.match(gateQuery("GET /pr/42 HTTP/1.1", ["--pr-only"]), /pullRequest\(number: 42\)/);
  for (const first of ["GET /queue HTTP/1.1", "GET /pr/0 HTTP/1.1", ""]) {
    assert.equal(gateQuery(first, ["--pr-only"]), "", first);
  }
});
