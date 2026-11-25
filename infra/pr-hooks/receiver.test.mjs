import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { test } from "node:test";
import {
  factsOf,
  forwardBudget,
  maxBodyBytes,
  receiver,
  serverFor,
  settingsFrom,
  signatureValid,
} from "./receiver.mjs";

const secret = "acme-webhook-secret";
const repos = ["acme/tools"];
const head = "8cc71d926".padEnd(40, "0");
const sign = (body, key = secret) =>
  `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;

const verdictDelivery = {
  action: "created",
  repository: { full_name: "acme/tools" },
  issue: { number: 6089, pull_request: {} },
  comment: {
    id: 7,
    body: "Liam: changes requested on head `8cc71d926`",
    author_association: "MEMBER",
    created_at: "2026-11-25T13:05:27Z",
    html_url: "https://github.com/acme/tools/pull/6089#c7",
  },
};

/** A receiver on a free port, with the facts it forwarded and the lines it logged. */
async function serve(t, { allow = () => true } = {}) {
  const forwarded = [];
  const logs = [];
  const server = serverFor(
    receiver({
      secret,
      repos,
      forward: async (fact) => forwarded.push(fact),
      allow,
      log: (line) => logs.push(line),
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const deliver = async (event, payload, signature) => {
    const body = JSON.stringify(payload);
    const headers = { "x-github-event": event, "content-type": "application/json" };
    const signed = signature === undefined ? sign(body) : signature;
    if (signed !== null) {
      headers["x-hub-signature-256"] = signed;
    }
    const answer = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers, body });
    // Forwarding runs after the answer; let it finish.
    await new Promise((resolve) => setImmediate(resolve));
    return answer.status;
  };
  return { deliver, forwarded, logs, port, server };
}

test("a signed verdict comment is forwarded once, as the plugin's comment event", async (t) => {
  const { deliver, forwarded } = await serve(t);
  assert.equal(await deliver("issue_comment", verdictDelivery), 202);
  assert.deepEqual(forwarded, [
    { repo: "acme/tools", pr: 6089, kind: "comment", comment: verdictDelivery.comment },
  ]);
});

test("a wrong or missing signature is refused with 401 and nothing is forwarded", async (t) => {
  const { deliver, forwarded, logs } = await serve(t);
  const body = JSON.stringify(verdictDelivery);
  assert.equal(await deliver("issue_comment", verdictDelivery, sign(body, "not-the-secret")), 401);
  assert.equal(await deliver("issue_comment", verdictDelivery, null), 401);
  assert.equal(await deliver("issue_comment", verdictDelivery, "sha256=00"), 401);
  assert.deepEqual(forwarded, []);
  // The log never holds the secret.
  assert.ok(logs.every((line) => !line.includes(secret)));
});

test("an empty secret refuses everything", () => {
  assert.equal(signatureValid("", Buffer.from("{}"), sign("{}", "")), false);
});

test("ci-ok on a pull request's head and a merge are forwarded; a merge group's run isn't", () => {
  const run = (pulls) => ({
    action: "completed",
    repository: { full_name: "acme/tools" },
    check_run: { name: "ci-ok", head_sha: head, conclusion: "failure", pull_requests: pulls },
  });
  assert.deepEqual(factsOf("check_run", run([{ number: 6089, head: { sha: head } }]), repos), [
    { repo: "acme/tools", pr: 6089, kind: "ci-ok", head, conclusion: "failure" },
  ]);
  assert.deepEqual(factsOf("check_run", run([]), repos), []);
  assert.deepEqual(
    factsOf("check_run", run([{ number: 6089, head: { sha: "f".repeat(40) } }]), repos),
    [],
  );
  const closed = {
    action: "closed",
    repository: { full_name: "acme/tools" },
    pull_request: { number: 6085, merged: true },
  };
  assert.deepEqual(factsOf("pull_request", closed, repos), [
    { repo: "acme/tools", pr: 6085, kind: "closed", merged: true },
  ]);
});

test("strangers' comments, other repositories and other events are ignored", () => {
  const stranger = {
    ...verdictDelivery,
    comment: { ...verdictDelivery.comment, author_association: "NONE" },
  };
  assert.deepEqual(factsOf("issue_comment", stranger, repos), []);
  const elsewhere = { ...verdictDelivery, repository: { full_name: "other/repo" } };
  assert.deepEqual(factsOf("issue_comment", elsewhere, repos), []);
  const chatter = { ...verdictDelivery, comment: { ...verdictDelivery.comment, body: "Thanks!" } };
  assert.deepEqual(factsOf("issue_comment", chatter, repos), []);
  assert.deepEqual(factsOf("push", verdictDelivery, repos), []);
});

test("past the per-minute limit facts are dropped and logged, not forwarded", async (t) => {
  let clock = 0;
  const allow = forwardBudget(1, () => clock);
  const { deliver, forwarded, logs } = await serve(t, { allow });
  await deliver("issue_comment", verdictDelivery);
  await deliver("issue_comment", verdictDelivery);
  assert.equal(forwarded.length, 1);
  assert.match(logs.at(-1), /per-minute limit/);
  clock = 61_000;
  await deliver("issue_comment", verdictDelivery);
  assert.equal(forwarded.length, 2);
});

test("a body past the cap is answered 413 without waiting for the rest of it", async (t) => {
  const { forwarded, port, server } = await serve(t);
  assert.equal(server.requestTimeout, 10_000);
  const outcome = await new Promise((resolve) => {
    const request = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/" }, (answer) =>
      resolve(answer.statusCode),
    );
    request.on("error", () => resolve("closed"));
    // Never ended: the receiver must not keep reading an unsigned body.
    request.write(Buffer.alloc(maxBodyBytes + 1));
    t.after(() => request.destroy());
  });
  assert.ok(outcome === 413 || outcome === "closed", `answered ${outcome}`);
  assert.deepEqual(forwarded, []);
});

test("the receiver refuses to start without the plugin's URL", () => {
  assert.throws(() => settingsFrom({}), /PR_HOOKS_FORWARD_URL/);
  assert.throws(() => settingsFrom({ PR_HOOKS_FORWARD_URL: " " }), /PR_HOOKS_FORWARD_URL/);
  const url = "https://paperclip.acme.test/api/plugins/agent-tools/chief-line/pr-event";
  assert.deepEqual(settingsFrom({ PR_HOOKS_FORWARD_URL: url }), {
    forwardUrl: url,
    repos: ["halonic-com/halonic"],
    max: 30,
    port: 8787,
  });
});
