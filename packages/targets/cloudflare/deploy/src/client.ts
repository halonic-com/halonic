import type {
  CloudflareAccount,
  CloudflareApi,
  FoundResource,
  Migration,
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
/** The table the Worker's own migration runner uses, so the two never disagree about what ran. */
const migrationsTable = "schema_migrations";
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

  /** Runs one SQL statement on a D1 database. Values go in `params`, never into the SQL text. */
  async function query(
    accountId: string,
    databaseId: string,
    sql: string,
    params: readonly string[] = [],
  ): Promise<Envelope> {
    const path = `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    return (await request("POST", path, { sql, params })) as Envelope;
  }

  /** Runs statements as one D1 batch: all of them or none. */
  async function batch(
    accountId: string,
    id: string,
    statements: readonly { sql: string; params?: readonly string[] }[],
  ): Promise<void> {
    const path = `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(id)}/query`;
    await request("POST", path, { batch: statements });
  }

  async function requireDatabase(accountId: string, name: string): Promise<string> {
    const id = await databaseId(accountId, name);
    if (!id) throw failed(`database ${name} not found`);
    return id;
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
  async function isMarked(accountId: string, id: string, ref: ResourceRef) {
    try {
      const body = await query(
        accountId,
        id,
        "SELECT 1 AS found FROM _halonic_marker WHERE resource = ?",
        [`${ref.kind}:${ref.name}`],
      );
      const rows = (body.result as { results?: unknown[] }[] | undefined)?.[0]?.results;
      return Array.isArray(rows) && rows.length > 0;
    } catch (error) {
      // Only D1's "no such table" answer means "not marked". A timeout, a 5xx or a token
      // without D1 access must surface, or the user is told to adopt for the wrong reason.
      if (error instanceof DeployError && /no such table/i.test(error.message)) return false;
      throw error;
    }
  }

  /** Writes the marker row for `ref` into the database named `databaseName`. */
  async function mark(accountId: string, databaseName: string, ref: ResourceRef) {
    const id = await databaseId(accountId, databaseName);
    if (!id) throw failed(`database ${databaseName} not found`);
    await markIn(accountId, id, ref);
  }

  async function markIn(accountId: string, id: string, ref: ResourceRef) {
    await query(
      accountId,
      id,
      "CREATE TABLE IF NOT EXISTS _halonic_marker (resource TEXT PRIMARY KEY)",
    );
    await query(accountId, id, "INSERT OR IGNORE INTO _halonic_marker (resource) VALUES (?)", [
      `${ref.kind}:${ref.name}`,
    ]);
  }

  async function findWorker(accountId: string, workerName: string) {
    const body = await request(
      "GET",
      `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/script-settings`,
      undefined,
      true,
    );
    if (!body) return undefined;
    const tags = (body.result as { tags?: unknown } | undefined)?.tags;
    return { marked: Array.isArray(tags) && tags.includes(markerTag) } satisfies FoundResource;
  }

  async function findDatabase(accountId: string, ref: ResourceRef) {
    const id = await databaseId(accountId, ref.name);
    if (!id) return undefined;
    return { marked: await isMarked(accountId, id, ref) } satisfies FoundResource;
  }

  async function findBucket(accountId: string, ref: ResourceRef) {
    const bucket = await request(
      "GET",
      `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(ref.name)}`,
      undefined,
      true,
    );
    if (!bucket) return undefined;
    const holder = ref.markedIn ? await databaseId(accountId, ref.markedIn) : undefined;
    return {
      marked: holder ? await isMarked(accountId, holder, ref) : false,
    } satisfies FoundResource;
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
      if (ref.kind === "worker") return findWorker(accountId, ref.name);
      if (ref.kind === "database") return findDatabase(accountId, ref);
      return findBucket(accountId, ref);
    },
    async createResource(accountId, ref) {
      const account = encodeURIComponent(accountId);
      if (ref.kind === "database") {
        const created = await request("POST", `/accounts/${account}/d1/database`, {
          name: ref.name,
        });
        const id = (created?.result as { uuid?: unknown } | undefined)?.uuid;
        if (typeof id !== "string") throw failed(`database ${ref.name} was created without an id`);
        // The database can't be marked first. If this write fails, the next deploy finds an
        // unmarked database and the way out is `adopt`.
        await markIn(accountId, id, ref);
      } else if (ref.kind === "bucket") {
        // Mark first: a marker for a bucket that doesn't exist is harmless (the next run
        // creates it), while a bucket without its marker would be refused as not ours.
        await mark(accountId, requireMarkedIn(ref), ref);
        await request("POST", `/accounts/${account}/r2/buckets`, { name: ref.name });
      }
    },
    async adoptResource(accountId, ref) {
      if (ref.kind === "database") await mark(accountId, ref.name, ref);
      else if (ref.kind === "bucket") await mark(accountId, requireMarkedIn(ref), ref);
    },
    async appliedMigrations(accountId, databaseName) {
      const id = await requireDatabase(accountId, databaseName);
      try {
        const body = await query(accountId, id, `SELECT id FROM ${migrationsTable} ORDER BY id`);
        const rows = (body.result as { results?: { id?: unknown }[] }[] | undefined)?.[0]?.results;
        return (rows ?? []).flatMap((row) => (typeof row.id === "string" ? [row.id] : []));
      } catch (error) {
        // A database that has never been migrated has no table yet.
        if (error instanceof DeployError && /no such table/i.test(error.message)) return [];
        throw error;
      }
    },
    async applyMigration(accountId, databaseName, migration: Migration) {
      const id = await requireDatabase(accountId, databaseName);
      await batch(accountId, id, [
        {
          sql: `CREATE TABLE IF NOT EXISTS ${migrationsTable} (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        },
        ...migration.statements.map((sql) => ({ sql })),
        { sql: `INSERT INTO ${migrationsTable} (id) VALUES (?)`, params: [migration.id] },
      ]);
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
