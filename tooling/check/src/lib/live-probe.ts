/**
 * The account probe (ADR 5.9, HAL-6804): before the live suites run, check
 * that the CI token reaches the test account and can do the harmless reads
 * the suites build on. It never writes, and never prints the token, the
 * account ID or the account's name.
 */

/** Cloudflare's API, version 4. */
export const cloudflareApiBase = "https://api.cloudflare.com/client/v4";

/** An answer from Cloudflare's API: the HTTP status and the parsed body. */
export interface ApiAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** A GET on Cloudflare's API, for a path below the version prefix. */
export type ApiGet = (path: string) => Promise<ApiAnswer>;

/** How one check of the probe went. */
export interface ProbeResult {
  readonly check: string;
  readonly outcome: "pass" | "fail" | "skip";
  readonly detail: string;
}

/** The kind of a Cloudflare API token, read from its prefix. */
export type TokenKind = "account" | "user";

/** `account` for a `cfat_` token, `user` for `cfut_`, `undefined` for anything else. */
export function tokenKind(token: string): TokenKind | undefined {
  if (token.startsWith("cfat_")) {
    return "account";
  }
  return token.startsWith("cfut_") ? "user" : undefined;
}

/** How long one request may take, in milliseconds, before the probe gives up on it. */
export const requestTimeoutMs = 20_000;

/** A GET with the token, through `fetch`; it fails after `timeoutMs` instead of hanging. */
export function cloudflareGet(
  token: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = requestTimeoutMs,
): ApiGet {
  return async (path) => {
    let text: string;
    let response: Response;
    try {
      response = await fetchImpl(`${cloudflareApiBase}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`the request timed out after ${timeoutMs / 1000} s.`);
      }
      throw error;
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: response.status, body };
  };
}

interface Envelope {
  readonly success?: unknown;
  readonly errors?: unknown;
  readonly result?: unknown;
}

function envelope(body: unknown): Envelope {
  return typeof body === "object" && body !== null ? body : {};
}

/** The `result` of a successful answer, or why it failed (status and Cloudflare's error codes). */
function resultOf(answer: ApiAnswer): { ok: true; result: unknown } | { ok: false; why: string } {
  const { success, errors, result } = envelope(answer.body);
  if (answer.status === 200 && success === true) {
    return { ok: true, result };
  }
  const codes = Array.isArray(errors)
    ? errors.map((error) => envelope(error) as { code?: unknown; message?: unknown })
    : [];
  const listed = codes.map(({ code, message }) => `${String(code)} ${String(message)}`).join("; ");
  return { ok: false, why: `HTTP ${answer.status}${listed === "" ? "" : `: ${listed}`}` };
}

async function check(
  name: string,
  request: () => Promise<ApiAnswer>,
  judge: (result: unknown) => string | undefined,
  passed: string,
): Promise<ProbeResult> {
  try {
    const answer = resultOf(await request());
    if (!answer.ok) {
      return { check: name, outcome: "fail", detail: answer.why };
    }
    const problem = judge(answer.result);
    return problem === undefined
      ? { check: name, outcome: "pass", detail: passed }
      : { check: name, outcome: "fail", detail: problem };
  } catch (error) {
    return {
      check: name,
      outcome: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const verifyPaths: Record<TokenKind, { check: string; path: (account: string) => string }> = {
  account: {
    check: "GET /accounts/{id}/tokens/verify (cfat_)",
    path: (account) => `/accounts/${account}/tokens/verify`,
  },
  user: { check: "GET /user/tokens/verify (cfut_)", path: () => "/user/tokens/verify" },
};

/** The checks that need a bare free account; they wait on HAL-6806. */
export const freeAccountChecks: readonly string[] = [
  "R2 bucket list answers 403 with code 10042 when R2 is off",
  "a version upload with limits.cpu_ms is refused on Workers Free",
  "an account without a workers.dev subdomain gets one with the deploy token",
];

/** Runs every check of the probe, in order, and returns how each went. */
export async function probeAccount(
  get: ApiGet,
  accountId: string,
  token: string,
): Promise<ProbeResult[]> {
  const results = await runChecks(get, accountId, token);
  // Some Cloudflare errors repeat the request path, which holds the account ID.
  return results.map((result) => ({
    ...result,
    detail: result.detail
      .replaceAll(accountId, "<account-id>")
      .replaceAll(encodeURIComponent(accountId), "<account-id>"),
  }));
}

async function runChecks(get: ApiGet, accountId: string, token: string): Promise<ProbeResult[]> {
  const account = encodeURIComponent(accountId);
  const results: ProbeResult[] = [];

  results.push(
    await check(
      "GET /accounts",
      () => get("/accounts"),
      (result) => {
        const found = Array.isArray(result)
          ? result.map((entry) => envelope(entry) as { id?: unknown; name?: unknown })
          : [];
        const ours = found.find((entry) => entry.id === accountId);
        if (ours === undefined) {
          return "the CI account is not in the list.";
        }
        return typeof ours.name === "string" && ours.name !== ""
          ? undefined
          : "the CI account has no name.";
      },
      "lists the CI account with its name",
    ),
  );

  const kind = tokenKind(token);
  if (kind === undefined) {
    results.push({
      check: "token verify",
      outcome: "fail",
      detail: "the token starts with neither cfat_ (account) nor cfut_ (user).",
    });
  } else {
    const verify = verifyPaths[kind];
    results.push(
      await check(
        verify.check,
        () => get(verify.path(account)),
        (result) => {
          const status = (envelope(result) as { status?: unknown }).status;
          return status === "active" ? undefined : `the token's status is ${String(status)}.`;
        },
        "the token is active",
      ),
    );
    const other: TokenKind = kind === "account" ? "user" : "account";
    results.push({
      check: verifyPaths[other].check,
      outcome: "skip",
      detail: `CI has no ${other} token yet; only the ${kind} token is checked.`,
    });
  }

  const reads: [string, string][] = [
    ["GET /accounts/{id}/workers/scripts", `/accounts/${account}/workers/scripts`],
    ["GET /accounts/{id}/d1/database", `/accounts/${account}/d1/database`],
    ["GET /accounts/{id}/r2/buckets", `/accounts/${account}/r2/buckets`],
  ];
  for (const [name, path] of reads) {
    results.push(
      await check(
        name,
        () => get(path),
        () => undefined,
        "the read succeeds",
      ),
    );
  }

  for (const name of freeAccountChecks) {
    results.push({
      check: name,
      outcome: "skip",
      detail: "needs a bare free account (HAL-6806).",
    });
  }
  return results;
}
