import type {
  ChoiceKey,
  CurrentModel,
  FirstRunKeyProvider,
  LocalModels,
  ModelChoice,
  ModelChoiceLine,
  ModelChoicePreview,
  ModelChoiceSaved,
  ModelChoiceService,
  ModelChoiceTest,
} from "@halonicjs/app";
import type { PageFetch } from "../runs/served-inbox-runs.ts";

/** Where the computer answers the model choice (`server.model-choice-routes`). */
const base = "/api/model-choice/";

/** What a failed Continue and a missing Ollama carry for the log, as the computer keeps the reason. */
const notSaid = "The computer keeps the reason in its own log.";

/**
 * The first run's model choice of a served window (`studio.served-model-choice`): every call goes
 * to the computer running Halonic on the page's own address and session, and the computer tests,
 * saves and reads. The browser holds no key after the request that sends it, and never trust:
 * Continue in a served window saves the choice, and the workspace is trusted on the computer.
 * A refused or broken answer rejects, so the screen says to try again.
 */
export class ServedModelChoice implements ModelChoiceService {
  readonly #fetch: PageFetch;

  /** @param fetchPage reads and posts a path on the page's own address */
  constructor(fetchPage: PageFetch) {
    this.#fetch = fetchPage;
  }

  test(choice: ModelChoice, key?: ChoiceKey): Promise<ModelChoiceTest> {
    // The key leaves the page only in this one request's body, and only for a key choice.
    const body = key === undefined ? { choice } : { choice, key: key.reveal() };
    return this.#call("POST", "test", body);
  }

  async keySaved(provider: FirstRunKeyProvider): Promise<boolean> {
    const answer = await this.#call<{ saved: boolean }>("GET", `key-saved/${provider}`);
    return answer.saved;
  }

  async lineFacts(choice: ModelChoice): Promise<ModelChoiceLine | undefined> {
    const answer = await this.#call<{ line: ModelChoiceLine | null }>("POST", "line-facts", {
      choice,
    });
    return answer.line ?? undefined;
  }

  async preview(testId: string): Promise<ModelChoicePreview | undefined> {
    const path = `preview/${encodeURIComponent(testId)}`;
    const answer = await this.#call<{ preview: ModelChoiceLine | null }>("GET", path);
    // No fingerprint comes from the computer: a served Continue never trusts (D2).
    return answer.preview === null ? undefined : { ...answer.preview, fingerprint: undefined };
  }

  async localModels(): Promise<LocalModels> {
    const answer = await this.#call<LocalModels>("GET", "local-models");
    return answer.kind === "not-found" ? { kind: "not-found", cause: notSaid } : answer;
  }

  async current(): Promise<CurrentModel | undefined> {
    const answer = await this.#call<{ current: CurrentModel | null }>("GET", "current");
    return answer.current ?? undefined;
  }

  async continue(testId: string): Promise<ModelChoiceSaved> {
    const saved = await this.#call<ModelChoiceSaved>("POST", "continue", { testId });
    return saved.ok ? saved : { ...saved, reason: notSaid };
  }

  async #call<Answer>(method: "GET" | "POST", endpoint: string, body?: unknown): Promise<Answer> {
    const init: RequestInit =
      body === undefined
        ? { method }
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const response = await this.#fetch(`${base}${endpoint}`, init);
    if (!response.ok) {
      // Only the status: the answer of a refused test is the server's fixed error, never the key.
      throw new Error(`The computer answered ${response.status} to ${method} ${base}${endpoint}.`);
    }
    return (await response.json()) as Answer;
  }
}
