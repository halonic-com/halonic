import type { ComputerId } from "../phone/phone-tunnel.ts";
import type { SavedDataStore } from "../phone/saved-messaging.ts";

/**
 * An in-memory {@link SavedDataStore} for the phone's tests: it keeps the
 * plain text the shell would encrypt, so a test can read what was saved.
 */
export class FakeSavedDataStore implements SavedDataStore {
  readonly texts = new Map<ComputerId, string>();
  readonly cleared: ComputerId[] = [];

  read(computer: ComputerId): Promise<string | undefined> {
    return Promise.resolve(this.texts.get(computer));
  }

  write(computer: ComputerId, text: string): Promise<void> {
    this.texts.set(computer, text);
    return Promise.resolve();
  }

  clear(computer: ComputerId): Promise<void> {
    this.texts.delete(computer);
    this.cleared.push(computer);
    return Promise.resolve();
  }
}
