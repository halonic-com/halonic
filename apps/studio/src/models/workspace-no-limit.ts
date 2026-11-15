import type { NoLimitMemory } from "@halonicjs/studio-feature-models/api";

/** The part of `Storage` that remembers one answer. */
export interface AnswerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Which providers got "No limit" on this device (`models.budget-step.no-limit-remembered`). It is
 * kept in the window's storage per workspace folder, provider and provider host, so a second
 * device asks again and so does a provider that moves to another host. Storage that can't be read
 * or written (a full or blocked one) keeps the answer for this session only.
 *
 * @example
 * services.provide(NoLimitMemoryService, new WorkspaceNoLimit(window.localStorage, location));
 */
export class WorkspaceNoLimit implements NoLimitMemory {
  readonly #storage: AnswerStorage | undefined;
  readonly #location: string;
  readonly #session = new Set<string>();

  constructor(storage: AnswerStorage | undefined, location: string) {
    this.#storage = storage;
    this.#location = location;
  }

  remembered(providerId: string, host: string): boolean {
    const key = this.#key(providerId, host);
    if (this.#session.has(key)) return true;
    try {
      return this.#storage?.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  remember(providerId: string, host: string): void {
    const key = this.#key(providerId, host);
    this.#session.add(key);
    try {
      this.#storage?.setItem(key, "1");
    } catch {
      // Kept for this session only.
    }
  }

  #key(providerId: string, host: string): string {
    return `halonic.no-limit:${this.#location}:${providerId}:${host}`;
  }
}
