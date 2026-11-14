import type {
  CloudflareAccount,
  CloudflareApi,
  FoundResource,
  ResourceRef,
  TokenStatus,
} from "./api.ts";
import { DeployError, redact } from "./errors.ts";

/** What the client needs to talk to Cloudflare. */
export interface CloudflareClientOptions {
  /** The API token. Sent as a bearer header only; never logged or put in an error. */
  readonly token: string;
  /** The fetch to use; defaults to the global one. */
  readonly fetch?: typeof fetch;
  /** The API base URL; defaults to Cloudflare's. */
  readonly baseUrl?: string;
}

interface Envelope {
  readonly success?: boolean;
  readonly errors?: readonly { readonly code?: number; readonly message?: string }[];
  readonly result?: unknown;
  readonly result_info?: { readonly page?: number; readonly total_pages?: number };
}

/** The Worker tag that marks a Worker as made by Halonic. */
export const markerTag = "halonic";
const defaultBaseUrl = "https://api.cloudflare.com/client/v4";
const requestTimeoutMs = 30_000;
const accountsPerPage = 50;
// A guard against a server that never stops paging.
const maxAccountPages = 100;

/** The real {@link CloudflareApi}, over `fetch`. */
export function createCloudflareClient(options: CloudflareClientOptions): CloudflareApi {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  async function get(path: string): Promise<Envelope> {
    return (await request("GET", path)) as Envelope;
  }

  /** Runs one SQL statement on a D1 database. */
  async function query(accountId: string, databaseId: string, sql: string): Promise<Envelope> {
    const path = `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    return (await request("POST", path, { sql })) as Envelope;
  }

  /** The database id for a name, or `undefined` when there is none. */
  async function databaseId(accountId: string, name: string): Promise<string | undefined> {
    const path = `/accounts/${encodeURIComponent(accountId)}/d1/database?name=${encodeURIComponent(name)}`;
    const result = (await get(path)).result;
    const match = Array.isArray(result)
      ? (result as { uuid?: unknown; name?: unknown }[]).find((d) => d.name === name)
      : undefined;
    return typeof match?.uuid === "string" ? match.uuid : undefined;
  }

  /** Whether the `_halonic_marker` table lists `kind:name`. A missing table means "no". */
  async function isMarked(accountId: string, databaseName: string, ref: ResourceRef) {
    const id = await databaseId(accountId, databaseName);
    if (!id) return false;
    try {
      const body = await query(
        accountId,
        id,
        `SELECT 1 AS found FROM _halonic_marker WHERE resource = '${ref.kind}:${ref.name}'`,
      );
      const rows = (body.result as { results?: unknown[] }[] | undefined)?.[0]?.results;
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }

  async function mark(accountId: string, databaseName: string, ref: ResourceRef) {
    const id = await databaseId(accountId, databaseName);
    if (!id) throw failed(`database ${databaseName} not found`);
    await query(
      accountId,
      id,
      "CREATE TABLE IF NOT EXISTS _halonic_marker (resource TEXT PRIMARY KEY)",
    );
    await query(
      accountId,
      id,
      `INSERT OR IGNORE INTO _halonic_marker (resource) VALUES ('${ref.kind}:${ref.name}')`,
    );
  }

  /** Sends one request. A network failure or timeout becomes a {@link DeployError}. */
  async function send(method: string, path: string, json?: unknown): Promise<Response> {
    const where = `${method} ${path}`;
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.token}`,
          ...(json === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "TimeoutError") {
        throw failed(`${where} timed out after ${requestTimeoutMs / 1000} s`);
      }
      const reason = cause instanceof Error ? cause.message : "unknown error";
      throw failed(`${where} failed: ${reason}`);
    }
  }

  /** `undefined` for a 404 when `allowMissing` is set; otherwise the envelope. */
  async function request(
    method: "GET" | "POST",
    path: string,
    json?: unknown,
    allowMissing = false,
  ): Promise<Envelope | undefined> {
    const response = await send(method, path, json);
    if (allowMissing && response.status === 404) return undefined;
    const body = await readEnvelope(response);
    if (!response.ok || body.success !== true) {
      throw failed(`${method} ${path} was refused (HTTP ${response.status})${describe(body)}`);
    }
    return body;
  }

  function failed(message: string): DeployError {
    return new DeployError("cloudflare-request-failed", redact(message, [options.token]));
  }

  return {
    async listAccounts() {
      const accounts: CloudflareAccount[] = [];
      for (let page = 1; page <= maxAccountPages; page += 1) {
        const body = await get(`/accounts?per_page=${accountsPerPage}&page=${page}`);
        if (!Array.isArray(body.result)) throw failed("unexpected response from GET /accounts");
        accounts.push(...accountsFrom(body.result));
        const totalPages = body.result_info?.total_pages;
        const done =
          typeof totalPages === "number"
            ? page >= totalPages
            : body.result.length < accountsPerPage;
        if (done) break;
      }
      return accounts;
    },
    async verifyUserToken() {
      return statusFrom((await get("/user/tokens/verify")).result);
    },
    async verifyAccountToken(accountId) {
      return statusFrom(
        (await get(`/accounts/${encodeURIComponent(accountId)}/tokens/verify`)).result,
      );
    },
    async findResource(accountId, ref) {
      const account = encodeURIComponent(accountId);
      const name = encodeURIComponent(ref.name);
      if (ref.kind === "worker") {
        const body = await request(
          "GET",
          `/accounts/${account}/workers/scripts/${name}/script-settings`,
          undefined,
          true,
        );
        if (!body) return undefined;
        const tags = (body.result as { tags?: unknown } | undefined)?.tags;
        return { marked: Array.isArray(tags) && tags.includes(markerTag) } satisfies FoundResource;
      }
      if (ref.kind === "database") {
        if (!(await databaseId(accountId, ref.name))) return undefined;
        return { marked: await isMarked(accountId, ref.name, ref) };
      }
      const bucket = await request(
        "GET",
        `/accounts/${account}/r2/buckets/${name}`,
        undefined,
        true,
      );
      if (!bucket) return undefined;
      return { marked: ref.markedIn ? await isMarked(accountId, ref.markedIn, ref) : false };
    },
    async createResource(accountId, ref) {
      const account = encodeURIComponent(accountId);
      if (ref.kind === "database") {
        await request("POST", `/accounts/${account}/d1/database`, { name: ref.name });
        await mark(accountId, ref.name, ref);
      } else if (ref.kind === "bucket") {
        await request("POST", `/accounts/${account}/r2/buckets`, { name: ref.name });
        await mark(accountId, requireMarkedIn(ref), ref);
      }
    },
    async adoptResource(accountId, ref) {
      if (ref.kind === "database") await mark(accountId, ref.name, ref);
      else if (ref.kind === "bucket") await mark(accountId, requireMarkedIn(ref), ref);
    },
  };

  function requireMarkedIn(ref: ResourceRef): string {
    if (!ref.markedIn) throw failed(`bucket ${ref.name} has no database to hold its marker`);
    return ref.markedIn;
  }
}

async function readEnvelope(response: Response): Promise<Envelope> {
  try {
    return (await response.json()) as Envelope;
  } catch {
    return {};
  }
}

function describe(body: Envelope): string {
  const errors = body.errors ?? [];
  if (errors.length === 0) return "";
  return `: ${errors.map((error) => `${error.code ?? "?"} ${error.message ?? ""}`.trim()).join("; ")}`;
}

function accountsFrom(result: readonly unknown[]): readonly CloudflareAccount[] {
  const accounts: CloudflareAccount[] = [];
  for (const entry of result as readonly { id?: unknown; name?: unknown }[]) {
    if (typeof entry.id === "string") {
      accounts.push({ id: entry.id, name: typeof entry.name === "string" ? entry.name : entry.id });
    }
  }
  return accounts;
}

function statusFrom(result: unknown): TokenStatus {
  const status = (result as { status?: unknown } | null)?.status;
  return { active: status === "active" };
}
