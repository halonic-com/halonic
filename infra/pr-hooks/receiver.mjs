// GitHub webhook receiver for the chief line's pull request outcomes (HAL-18586).
//
// Runs as its own small container beside chief-line-receiver, never inside
// Paperclip. It checks every delivery's X-Hub-Signature-256 against the
// webhook secret, keeps only the three facts the chief line posts (a signed
// verdict comment by the team, a completed `ci-ok` on a pull request's head,
// a closed pull request), and forwards each one to the Agent tools plugin's
// board-only POST /chief-line/pr-event route. The plugin decides whether the
// pull request is tracked and whether the fact is new; the PR watcher's
// 10-minute pass catches anything this drops. No dependencies, Node only.
//
// The secret and the board credential are read from files (the secret store
// mounts them), never from argv, and are never logged.

import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

/** GitHub's deliveries for these events are far smaller; anything larger is refused unread. */
export const maxBodyBytes = 1024 * 1024;
/** A delivery must arrive in full within this time, so a slow sender can't hold a connection. */
const requestTimeoutMs = 10_000;
const teamAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** Whether `header` is GitHub's `sha256=<hex>` HMAC of the raw body with `secret`. */
export function signatureValid(secret, rawBody, header) {
  if (typeof header !== "string" || !header.startsWith("sha256=") || secret === "") {
    return false;
  }
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
  );
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function commentFacts(payload, base) {
  const { action, issue, comment } = payload;
  const signedLooking =
    action === "created" &&
    issue?.pull_request !== undefined &&
    teamAssociations.has(comment?.author_association) &&
    / on head\b/i.test(comment?.body ?? "");
  if (!signedLooking) {
    return [];
  }
  return [
    {
      ...base,
      pr: issue.number,
      kind: "comment",
      comment: {
        id: comment.id,
        body: comment.body,
        author_association: comment.author_association,
        created_at: comment.created_at,
        html_url: comment.html_url,
      },
    },
  ];
}

function checkRunFacts(payload, base) {
  const run = payload.check_run;
  if (payload.action !== "completed" || run?.name !== "ci-ok") {
    return [];
  }
  // Only pull requests whose head is this run's commit; a merge group's run names none.
  return (run.pull_requests ?? [])
    .filter((pull) => pull.head?.sha === run.head_sha)
    .map((pull) => ({
      ...base,
      pr: pull.number,
      kind: "ci-ok",
      head: run.head_sha,
      conclusion: run.conclusion,
    }));
}

/** The facts to forward from one verified delivery; empty for anything the chief line doesn't post. */
export function factsOf(eventName, payload, repos) {
  const repo = payload?.repository?.full_name;
  if (typeof repo !== "string" || !repos.includes(repo)) {
    return [];
  }
  const base = { repo };
  if (eventName === "issue_comment") {
    return commentFacts(payload, base);
  }
  if (eventName === "check_run") {
    return checkRunFacts(payload, base);
  }
  if (eventName === "pull_request" && payload.action === "closed") {
    return [
      {
        ...base,
        pr: payload.pull_request.number,
        kind: "closed",
        merged: payload.pull_request.merged === true,
      },
    ];
  }
  return [];
}

/** At most `max` forwards in any 60 seconds; the rest are dropped for the PR watcher's pass. */
export function forwardBudget(max, now = Date.now) {
  let sent = [];
  return () => {
    const minuteAgo = now() - 60_000;
    sent = sent.filter((at) => at > minuteAgo);
    if (sent.length >= max) {
      return false;
    }
    sent.push(now());
    return true;
  };
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    // Past the cap reading stops at once; the handler answers 413 and closes the connection.
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        request.pause();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", () => resolve(undefined));
  });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * The request handler: 401 for a missing or wrong signature (nothing is
 * read past it or forwarded), 202 when facts were handed on, 204 when the
 * delivery holds none. Forwarding happens after the answer, so GitHub never
 * waits on Paperclip.
 */
export function receiver({ secret, repos, forward, allow, log = console.error }) {
  return async (request, response) => {
    const answer = (status) => response.writeHead(status).end();
    if (request.method !== "POST") {
      return answer(405);
    }
    const raw = await readBody(request);
    if (raw === undefined) {
      // The rest of the body is never read: close the connection once the answer is out.
      return response.writeHead(413, { connection: "close" }).end(() => request.destroy());
    }
    if (!signatureValid(secret, raw, request.headers["x-hub-signature-256"])) {
      log("pr-hooks: refused a delivery with a missing or wrong signature.");
      return answer(401);
    }
    const payload = parseJson(raw);
    if (payload === undefined) {
      return answer(400);
    }
    const facts = factsOf(request.headers["x-github-event"], payload, repos);
    answer(facts.length === 0 ? 204 : 202);
    for (const fact of facts) {
      if (!allow()) {
        log(`pr-hooks: over the per-minute limit, left ${fact.repo}#${fact.pr} to the PR watcher.`);
        continue;
      }
      await forward(fact).catch((error) => {
        log(`pr-hooks: couldn't forward ${fact.repo}#${fact.pr}: ${error.message}`);
      });
    }
  };
}

/** Posts one fact to the plugin's route with the board credential; throws on a refusal. */
export function forwarder(url, token, fetchImpl = fetch) {
  return async (fact) => {
    const answer = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(fact),
      signal: AbortSignal.timeout(10_000),
    });
    if (!answer.ok) {
      throw new Error(`the plugin answered ${answer.status}`);
    }
  };
}

/** An HTTP server for the handler, with a time limit on every request. */
export function serverFor(handler) {
  const server = createServer(handler);
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = requestTimeoutMs;
  return server;
}

/** The settings from the environment; throws when the plugin's URL is missing, so the receiver never starts without one. */
export function settingsFrom(env) {
  const forwardUrl = (env.PR_HOOKS_FORWARD_URL ?? "").trim();
  if (!URL.canParse(forwardUrl)) {
    throw new Error("PR_HOOKS_FORWARD_URL must be the plugin's /chief-line/pr-event URL.");
  }
  const max = Number(env.PR_HOOKS_MAX_PER_MINUTE ?? "30");
  return {
    forwardUrl,
    repos: (env.PR_HOOKS_REPOS ?? "halonic-com/halonic").split(",").map((r) => r.trim()),
    max: Number.isInteger(max) && max > 0 ? max : 30,
    port: Number(env.PR_HOOKS_PORT ?? "8787"),
  };
}

const readSecret = (name) => readFileSync(process.env[name] ?? "", "utf8").trim();

if (import.meta.url === `file://${process.argv[1]}`) {
  const { forwardUrl, repos, max, port } = settingsFrom(process.env);
  const handler = receiver({
    secret: readSecret("PR_HOOKS_SECRET_FILE"),
    repos,
    forward: forwarder(forwardUrl, readSecret("PR_HOOKS_TOKEN_FILE")),
    allow: forwardBudget(max),
  });
  serverFor(handler).listen(port, () => console.log(`pr-hooks: listening on ${port}`));
}
