import type { CloudflareAccount, CloudflareApi, TokenStatus } from "./api.ts";
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
    const where = `GET ${path}`;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${options.token}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "TimeoutError") {
        throw failed(`${where} timed out after ${requestTimeoutMs / 1000} s`);
      }
      const reason = cause instanceof Error ? cause.message : "unknown error";
      throw failed(`${where} failed: ${reason}`);
    }
    const body = await readEnvelope(response);
    if (!response.ok || body.success !== true) {
      throw failed(`${where} was refused (HTTP ${response.status})${describe(body)}`);
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
  };
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
