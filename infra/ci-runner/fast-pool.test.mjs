// The fast pool (HAL-15972, HAL-17463, HAL-17616): a pull request runs on our CI server only on a
// fast slot, only from a halonic-com/halonic branch, only while it's open, at the event's commit,
// labelled fast-track and opened by a person, not a bot, at job start (the VM's gate says so, not
// the event), and only with the shared caches read-only. These tests run the
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
  shipped,
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
          headRefName: "mateo/HAL-1-x",
          headRepositoryOwner: { login: "halonic-com" },
          labels: { nodes: [{ name: "fast-track" }] },
          author: { __typename: "User", login: "halonic-dev" },
          ...patch,
        },
      },
    },
  });
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

test("fast pool: accepts an open own-branch fast-track pull request a person opened, checked at job start", () => {
  const res = fast();
  assert.equal(res.ok, true, res.out);
  assert.match(res.out, /halonic-ci: accepted pull_request/);
  assert.deepEqual(res.asked, ["/pr/42"]);
  // Other labels next to it don't matter.
  const more = { labels: { nodes: [{ name: "ci" }, { name: "fast-track" }] } };
  assert.equal(fast({ gate: { status: 200, body: livePr(more) } }).ok, true);
});

test("fast pool: refuses a same-repo pull request without the fast-track label (HAL-17616)", () => {
  // The label is read from the gate's answer at job start, never from the event.
  for (const labels of [
    { nodes: [] },
    { nodes: [{ name: "ci" }, { name: "fast-track-later" }, { name: "Fast-Track " }] },
    { nodes: null },
    null,
    undefined,
  ]) {
    refused(
      fast({ gate: { status: 200, body: livePr({ labels }) } }),
      /#42 has no fast-track label/,
    );
  }
});

test("fast pool: refuses a fork pull request, whatever its event says", () => {
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

const author = (__typename, login) => livePr({ author: { __typename, login } });

test("fast pool: refuses a fast-track pull request a bot opened, whatever its event or ci.yml says (HAL-17463)", () => {
  // Every answer below carries the fast-track label (livePr's default): the label never admits a bot.
  // GraphQL gives a GitHub App's login without "[bot]" and its type as Bot; either refuses.
  for (const login of ["dependabot", "renovate", "github-actions", "halonic-dev"]) {
    refused(fast({ gate: { status: 200, body: author("Bot", login) } }), /by a Bot account/);
  }
  for (const login of ["dependabot[bot]", "renovate[bot]", "Some-App[BOT]"]) {
    refused(fast({ gate: { status: 200, body: author("User", login) } }), /opened by the bot /);
  }
  for (const login of ["dependabot", "Renovate", "renovate-bot"]) {
    refused(fast({ gate: { status: 200, body: author("User", login) } }), /opened by the bot /);
  }
  for (const type of ["Mannequin", "Organization", "EnterpriseUserAccount", null]) {
    refused(fast({ gate: { status: 200, body: author(type, "someone") } }), /not a person/);
  }
  // A person whose login only contains a bot's name is a person.
  assert.equal(fast({ gate: { status: 200, body: author("User", "renovate-fan") } }).ok, true);
});

test("fast pool: refuses a person's pull request from a bot's branch, or with no head branch (HAL-17473)", () => {
  for (const branch of ["dependabot/npm/x", "renovate/foo", "Dependabot/npm/x", "RENOVATE/foo"]) {
    const res = fast({ gate: { status: 200, body: livePr({ headRefName: branch }) } });
    refused(res, /#42 comes from a bot branch/);
  }
  for (const missing of [{ headRefName: null }, { headRefName: undefined }, { headRefName: "" }]) {
    refused(fast({ gate: { status: 200, body: livePr(missing) } }), /no head branch we can check/);
  }
  refused(fast({ gate: { status: 200, body: livePr({ headRefName: 7 }) } }), /no head branch/);
  // A person's own branch, or one that only mentions a bot, is admitted.
  for (const branch of ["mateo/HAL-1-x", "mateo/HAL-2-bump-renovate", "dependabot-config"]) {
    const res = fast({ gate: { status: 200, body: livePr({ headRefName: branch }) } });
    assert.equal(res.ok, true, `${branch}: ${res.out}`);
  }
});

test("fast pool: refuses a pull request whose author is missing (a deleted account, an old gate)", () => {
  for (const missing of [{ author: null }, { author: undefined }, { author: {} }]) {
    refused(fast({ gate: { status: 200, body: livePr(missing) } }), /no author we can check/);
  }
  const noLogin = { author: { __typename: "User", login: null } };
  refused(fast({ gate: { status: 200, body: livePr(noLogin) } }), /no author we can check/);
  // The answer at job start counts: a fork's approved run stays refused.
  refused(
    fast({ event: forkEvent, gate: { status: 200, body: livePr(FORK) } }),
    /someone\/halonic/,
  );
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

// Runs the hook's cache_safe as shipped for one cache, with `pool` as POOL and `mountinfo` as the
// mount table. Only the fast pool reaches it today (a pull request elsewhere is refused before), so
// these call it directly: 9p must not count as safe on any other pool if that ever changes.
const cacheSafe = (pool, mountinfo) => {
  const fn = shipped.match(/^cache_safe\(\) \{\n[\s\S]*?\n\}$/m);
  assert.ok(fn, "cache_safe() in vm/job-started.sh");
  const table = join(mkdtempSync(join(dir, "cache-safe-")), "mountinfo");
  writeFileSync(table, mountinfo);
  const res = spawnSync("/bin/bash", [
    "-c",
    `${fn[0]}\nPOOL=$1 MOUNTS=$2 cache_safe /cache/turbo`,
    "x",
    pool,
    table,
  ]);
  return res.status === 0;
};

test("fast pool: a cache that shows as 9p counts as safe on the fast pool only (Julian, HAL-15972)", () => {
  assert.equal(cacheSafe("fast", mounts("9p")), true);
  for (const pool of ["", "large", "fast2"])
    assert.equal(cacheSafe(pool, mounts("9p")), false, pool);
  // Overlays and read-only mounts count everywhere; the shared folder itself nowhere.
  for (const pool of ["", "fast"]) {
    assert.equal(cacheSafe(pool, mounts("overlay")), true, pool);
    assert.equal(cacheSafe(pool, mounts("ro")), true, pool);
    assert.equal(cacheSafe(pool, mounts("rw")), false, pool);
  }
});

test("fast pool: fast slots run under gVisor, on their own network, with their own gate socket", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(
    slot.includes(
      'SANDBOX=(--runtime=runsc --network="$FAST_NET" -v "$RUN/resolv.conf:/etc/resolv.conf:ro"); GATE_DIR=$FAST_GATES/$SLOT',
    ),
  );
  // gVisor can't reach Docker's embedded DNS (127.0.0.11), so the container gets the two
  // resolvers the VM's firewall allows, and nothing else.
  assert.ok(
    slot.includes(`printf 'nameserver 1.1.1.1\\nnameserver 1.0.0.1\\n' > "$RUN/resolv.conf"`),
  );
  assert.ok(slot.includes('--security-opt no-new-privileges "${SANDBOX[@]}" \\'));
  assert.ok(
    slot.includes('[ "$(findmnt -n -o FSTYPE --mountpoint "$OVL_MNT/$c")" = overlay ] || fail'),
  );
  // One socket per fast slot (HAL-17473), so one job can't hold another slot's connections; the
  // slot refuses to start without its own.
  const socket = read("vm/halonic-ci-gate-fast@.socket");
  assert.match(socket, /^ListenStream=\/run\/halonic-ci-gate-fast\/%i\/gate\.sock$/m);
  assert.match(slot, /^FAST_GATES=\/run\/halonic-ci-gate-fast /m);
  assert.ok(slot.includes('[ -S "$FAST_GATES/$SLOT/gate.sock" ] || fail'));
  // A job's three tries; 3 per 150 s on each of 40 slots caps it at 2880 of the token's 5000 an hour.
  assert.match(socket, /^MaxConnections=3$/m);
  assert.match(socket, /^PollLimitIntervalSec=150s$/m);
  assert.match(socket, /^PollLimitBurst=3$/m);
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
  // A snapshot of the shared folder is the overlay's lower layer, read-only (HAL-16032, in
  // fast-lower.test.mjs); the container mounts the overlay.
  assert.ok(slot.includes('"lowerdir=$LOWER_GEN/$c,upperdir=$OVL/$c/upper,workdir=$OVL/$c/work"'));
  assert.ok(slot.includes("  CACHE_SRC=$OVL_MNT\nfi"));
  assert.match(slot, /if \[ "\$LABEL" = halonic-ci-fast \]; then\n {2}for c in \$CACHES/);
  assert.doesNotMatch(slot, /-v "\$TRUSTED\//);
  for (const cache of ["pnpm-store", "turbo", "ms-playwright"]) {
    assert.ok(slot.includes(`-v "$CACHE_SRC/${cache}:/cache/${cache}"`), cache);
  }
});

// The CPUs the slot script pins `slot` to, from its CPUSET table as shipped. `float`: runsc runs with
// --cpu-num-from-quota, so fast-11..40 float over FAST_WIDE (HAL-17574).
const cpusOf = (slot, float = false) => {
  const table = read("vm/halonic-runner-slot.sh").match(/^FAST4_FROM=[\s\S]*?\nesac$/m);
  assert.ok(table, "FAST4_FROM and the CPUSET table in vm/halonic-runner-slot.sh");
  const res = spawnSync("/bin/bash", ["-c", `${table[0]}\necho "$CPUSET"`], {
    encoding: "utf8",
    env: { SLOT: slot, N: slot.split("-")[1], ...(float ? { FAST_FLOAT: "1" } : {}) },
  });
  return res.stdout
    .trim()
    .split(",")
    .flatMap((part) => {
      const [from, to = from] = part.split("-").map(Number);
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
};

test("fast pool: fast-11..24 get 4 CPUs each, two whole cores, apart from each other (HAL-17463)", () => {
  const taken = new Map();
  for (let n = 11; n <= 24; n++) {
    const cpus = cpusOf(`fast-${n}`);
    assert.equal(cpus.length, 4, `fast-${n}`);
    assert.equal(cpus[0] % 2, 0, `fast-${n} starts mid-core`);
    for (const cpu of cpus) {
      // 66-71 are the small slots', 102-111 the VM's own.
      assert.ok(cpu <= 101 && (cpu < 66 || cpu > 71), `fast-${n} takes CPU ${cpu}`);
      assert.equal(taken.get(cpu), undefined, `fast-${n} and ${taken.get(cpu)} share CPU ${cpu}`);
      taken.set(cpu, `fast-${n}`);
    }
  }
  // The older fast slots keep their CPUs.
  assert.deepEqual(cpusOf("fast-1"), [60, 61, 62, 63, 64, 65]);
  assert.deepEqual(cpusOf("fast-9"), [15, 16, 17, 18, 19, 20]);
  assert.deepEqual(cpusOf("fast-10"), [39, 40, 41, 42, 43, 44]);
});

test("fast pool: fast-11..40 float over every CPU but the small slots' and the VM's (HAL-17574)", () => {
  const wide = [...Array(66).keys(), ...Array.from({ length: 30 }, (_, i) => 72 + i)];
  for (let n = 11; n <= 40; n++) assert.deepEqual(cpusOf(`fast-${n}`, true), wide, `fast-${n}`);
  // Only the 4-CPU slots float: the others keep their sets, whatever runsc says.
  assert.deepEqual(cpusOf("fast-1", true), [60, 61, 62, 63, 64, 65]);
  assert.deepEqual(cpusOf("large-1", true), [0, 1, 2, 3, 4, 5]);
  // Without the flag, fast-25..40 get a fixed 4-vCPU set of whole cores off the small slots' and
  // the VM's, and fast-11..24 keep theirs.
  for (let n = 25; n <= 40; n++) {
    const cpus = cpusOf(`fast-${n}`);
    assert.equal(cpus.length, 4, `fast-${n}`);
    assert.equal(cpus[0] % 2, 0, `fast-${n} starts mid-core`);
    for (const cpu of cpus)
      assert.ok(cpu <= 101 && (cpu < 66 || cpu > 71), `fast-${n} takes ${cpu}`);
  }
  assert.deepEqual(cpusOf("fast-11"), [0, 1, 2, 3]);
  assert.deepEqual(cpusOf("fast-24"), [92, 93, 94, 95]);
  // The job sees its quota, not the set, only when runsc says so; and large slots get twice the
  // CPU weight, so a merge-group job wins the cores it shares with floating fast jobs.
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(slot.includes(`docker info --format '{{json (index .Runtimes "runsc")}}'`));
  assert.ok(
    slot.includes('if [[ "$rargs" =~ \\"--cpu-num-from-quota(=true)?\\" ]]; then FAST_FLOAT=1; fi'),
  );
  assert.ok(slot.includes('SHARES=1024; [ "$LABEL" != halonic-ci-large ] || SHARES=2048'));
  assert.ok(slot.includes('--cpus "$CPUS" --cpuset-cpus "$CPUSET" --cpu-shares "$SHARES"'));
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
  // The label and the author both decide (HAL-17616); 100 labels, and a missing one refuses.
  assert.match(asked, /labels\(first: 100\) \{ nodes \{ name \} \} author \{ __typename login \}/);
  assert.match(asked, / headRefName /);
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
