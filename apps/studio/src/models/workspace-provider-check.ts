import { defaultBaseUrl, type HttpClient } from "@halonicjs/ports";
import type { ProviderCheck } from "@halonicjs/studio-feature-models/api";

/** How long Check waits for an answer before it says the provider isn't answering. */
const CHECK_TIMEOUT_MS = 5_000;

/** The part of the workspace's trust the check reads. */
interface CheckTrust {
  isTrusted(): boolean;
  subscribe(listener: () => void): () => void;
}

/** The part of a provider the check reads. */
interface CheckedProvider {
  readonly type: string;
  readonly baseUrl?: string | undefined;
}

/**
 * Check on a local provider's page (`models.providers.check`): asks the provider's model list
 * (`<base URL>/models`, which Ollama, LM Studio and other OpenAI-compatible servers answer) through
 * the shell, so the answer comes from this computer and the web view's CORS rules don't apply.
 * Any answer with a success status means it is answering; a refusal, an error status or no answer
 * in five seconds means it is not.
 *
 * Until the person trusts the workspace, the address comes from a file nobody has reviewed, so Check
 * asks only an address on this computer (`localhost` or a loopback address), and leaves out the base
 * URL's query; for any other address there is nothing to check yet, and the page says it waits for
 * trust. Trusting the workspace tells the page to read the address again.
 *
 * @example
 * services.provide(ProviderCheckService, new WorkspaceProviderCheck(new ShellHttpClient(ipc), trust));
 */
export class WorkspaceProviderCheck implements ProviderCheck {
  readonly #http: HttpClient;
  readonly #trust: CheckTrust;

  constructor(http: HttpClient, trust: CheckTrust) {
    this.#http = http;
    this.#trust = trust;
  }

  addressOf(provider: CheckedProvider): string | undefined {
    return this.#checked(provider)?.host;
  }

  waitsForTrust(provider: CheckedProvider): boolean {
    return baseOf(provider) !== undefined && this.#checked(provider) === undefined;
  }

  subscribe(onChange: () => void): () => void {
    return this.#trust.subscribe(onChange);
  }

  async isAnswering(provider: CheckedProvider): Promise<boolean> {
    const base = this.#checked(provider);
    if (base === undefined) return false;
    try {
      const response = await this.#http.fetch(`${base.href.replace(/\/+$/, "")}/models`, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** The address Check asks, or `undefined` when there is none it may ask. */
  #checked(provider: CheckedProvider): URL | undefined {
    const base = baseOf(provider);
    if (base === undefined || this.#trust.isTrusted()) return base;
    if (!isOnThisComputer(base)) return undefined;
    base.search = "";
    base.hash = "";
    return base;
  }
}

/** The address the provider calls, when it is a URL we can read. */
function baseOf({ type, baseUrl }: CheckedProvider): URL | undefined {
  const base = baseUrl ?? defaultBaseUrl(type);
  if (base === undefined) return undefined;
  try {
    return new URL(base);
  } catch {
    return undefined;
  }
}

/** Whether a web address is on this computer: `localhost`, `127.x.x.x` or `[::1]`. */
function isOnThisComputer(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}
