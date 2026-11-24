import type { MessagingId } from "@halonicjs/ports";

/**
 * Which provider gave which ID, as the hub last read them. IDs are opaque
 * (ADR 2026-11-24, agent messaging), so the hub never parses one to find its
 * provider: it remembers who listed it.
 */
export class OwnerIndex {
  readonly #owned: Set<MessagingId>[];

  constructor(providers: number) {
    this.#owned = Array.from({ length: providers }, () => new Set<MessagingId>());
  }

  /** Replaces what one provider owns with the IDs it just listed. */
  record(provider: number, ids: readonly MessagingId[]): void {
    this.#owned[provider] = new Set(ids);
  }

  /** The providers that listed `id`: none, one, or more if two providers broke the port's promise of unique IDs. */
  ownersOf(id: MessagingId): number[] {
    return this.#owned.flatMap((ids, provider) => (ids.has(id) ? [provider] : []));
  }
}
