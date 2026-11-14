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
}

const defaultBaseUrl = "https://api.cloudflare.com/client/v4";

/** The real {@link CloudflareApi}, over `fetch`. */
export function createCloudflareClient(options: CloudflareClientOptions): CloudflareApi {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  async function get(path: string): Promise<unknown> {
    const where = `GET ${path}`;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${options.token}` },
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown error";
      throw failed(`${where} failed: ${reason}`);
    }
    const body = await readEnvelope(response);
    if (!response.ok || body.success !== true) {
      throw failed(`${where} was refused (HTTP ${response.status})${describe(body)}`);
    }
    return body.result;
  }

  function failed(message: string): DeployError {
    return new DeployError("cloudflare-request-failed", redact(message, [options.token]));
  }

  return {
    async listAccounts() {
      return accountsFrom(await get("/accounts"));
    },
    async verifyUserToken() {
      return statusFrom(await get("/user/tokens/verify"));
    },
    async verifyAccountToken(accountId) {
      return statusFrom(await get(`/accounts/${encodeURIComponent(accountId)}/tokens/verify`));
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

function accountsFrom(result: unknown): readonly CloudflareAccount[] {
  if (!Array.isArray(result)) return [];
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
