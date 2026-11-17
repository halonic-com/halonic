import { defaultBaseUrl, type HttpClient } from "@halonicjs/ports";
import type { ProviderCheck } from "@halonicjs/studio-feature-models/api";

/** How long Check waits for an answer before it says the provider isn't answering. */
const CHECK_TIMEOUT_MS = 5_000;

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
 * @example
 * services.provide(ProviderCheckService, new WorkspaceProviderCheck(new ShellHttpClient(ipc)));
 */
export class WorkspaceProviderCheck implements ProviderCheck {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  addressOf(provider: CheckedProvider): string | undefined {
    const base = baseOf(provider);
    return base === undefined ? undefined : new URL(base).host;
  }

  async isAnswering(provider: CheckedProvider): Promise<boolean> {
    const base = baseOf(provider);
    if (base === undefined) return false;
    try {
      const response = await this.#http.fetch(`${base.replace(/\/+$/, "")}/models`, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/** The address the provider calls, when it is a URL we can read. */
function baseOf({ type, baseUrl }: CheckedProvider): string | undefined {
  const base = baseUrl ?? defaultBaseUrl(type);
  return base !== undefined && URL.canParse(base) ? base : undefined;
}
