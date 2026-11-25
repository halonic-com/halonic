// Where a run's bridge credential is kept on the Worker: in its run object's own storage, next
// to the run's log, so the credential lives and dies with the run and no other object holds it.

import type {
  RunCredentialBinding,
  RunCredentialStore,
  StoredRunCredential,
} from "@halonicjs/adapter-harness-bridge/web";

/** The storage key of a run's credential record. */
const credentialKey = (runId: string): string => `bridge-credential/${runId}`;

/** The key-value part of a Durable Object's storage, as far as the store uses it. */
export interface CredentialStorage {
  get<Value>(key: string): Promise<Value | undefined>;
  put<Value>(key: string, value: Value): Promise<void>;
}

/** A Durable Object's storage, with the transaction that makes a look and a write one step. */
export interface TransactionalCredentialStorage extends CredentialStorage {
  transaction<Result>(work: (transaction: CredentialStorage) => Promise<Result>): Promise<Result>;
}

/**
 * The run credentials of one run object, in its storage (requirement `runtime.worker-bridge`).
 * Only the credential's SHA-256 is stored, as {@link RunCredentials} gives it.
 *
 * @example
 * const credentials = new RunCredentials({ store: new DurableRunCredentialStore(ctx.storage), clock });
 */
export class DurableRunCredentialStore implements RunCredentialStore<RunCredentialBinding> {
  readonly #storage: TransactionalCredentialStorage;

  constructor(storage: TransactionalCredentialStorage) {
    this.#storage = storage;
  }

  read(runId: string): Promise<StoredRunCredential<RunCredentialBinding> | undefined> {
    return this.#storage.get(credentialKey(runId));
  }

  /** In one transaction, so two calls for one run never both create a record. */
  create(record: StoredRunCredential<RunCredentialBinding>): Promise<boolean> {
    const key = credentialKey(record.binding.runId);
    return this.#storage.transaction(async (transaction) => {
      if ((await transaction.get(key)) !== undefined) return false;
      await transaction.put(key, record);
      return true;
    });
  }

  write(record: StoredRunCredential<RunCredentialBinding>): Promise<void> {
    return this.#storage.put(credentialKey(record.binding.runId), record);
  }
}
