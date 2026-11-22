import type { ServiceKey, ServiceTarget } from "@halonicjs/studio-shell";
import type { CheckComputerSource } from "../api.ts";
import type { CheckFact } from "../check-facts.ts";

/** The services of one open folder, in memory, as the app's registry gives them. */
export class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}

/**
 * A source whose checks answer `facts` at once, then stay running until `finish()`, so a test can
 * see the lines that came while the check still runs. It records each check's signal.
 */
export class FakeCheckSource implements CheckComputerSource {
  readonly about = "Halonic 0.1.0 · macOS arm64";
  readonly signals: AbortSignal[] = [];
  facts: readonly CheckFact[];
  readonly #demo: boolean;
  #finish: () => void = () => {};

  constructor(facts: readonly CheckFact[], demo = false) {
    this.facts = facts;
    this.#demo = demo;
  }

  isDemo(): boolean {
    return this.#demo;
  }

  /** Ends the running check: every line has answered. */
  finish(): void {
    this.#finish();
  }

  async *check(signal: AbortSignal): AsyncIterable<CheckFact> {
    this.signals.push(signal);
    const finished = new Promise<void>((resolve) => {
      this.#finish = resolve;
    });
    for (const fact of this.facts) yield fact;
    await finished;
  }
}
