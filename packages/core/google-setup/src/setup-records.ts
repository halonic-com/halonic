import type { Clock, IdGenerator, RecordStore } from "@halonicjs/ports";
import type { AccountType } from "./account-type.ts";
import type { RefreshRefusal } from "./refresh-answer.ts";
import { editedValues, type SetupEdit } from "./setup-edit.ts";
import type { SetupRoute } from "./setup-input.ts";
import {
  isServiceId,
  type SetupRecord,
  type SetupValues,
  setupCollection,
} from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { clearClientRefusals, saveRefreshRefused } from "./setup-refusals.ts";
import { shareClient } from "./share-client.ts";
import { accountRefPrefix, isSetupRef } from "./store-names.ts";
import { storedSetups } from "./stored-setups.ts";

export interface SetupRecordsOptions {
  /**
   * Where the records are kept, in the collection `_google_setups`. **Agents,
   * tools and hubs must not be able to write to it**: the record decides
   * which client secret a sign-in uses.
   */
  readonly records: RecordStore;
  /** The time each change is stamped with. */
  readonly clock: Clock;
  /** Makes the account refs. */
  readonly ids: IdGenerator;
}

/** What a new setup starts with: the two answers the item asks first. */
export interface NewSetup {
  readonly route: SetupRoute;
  readonly accountType: AccountType;
}

/**
 * The saved setup progress, one record per Google account (design 3.6, plan
 * D5). It never holds a secret or a token: see `SetupValues`.
 */
export interface SetupRecords {
  /** Starts a record under a new random account ref. */
  start(setup: NewSetup): Promise<SetupRecord>;

  /**
   * The record for an account ref, or `null` when there is none.
   *
   * @throws SetupRecordError `damaged` when the stored record isn't valid
   */
  read(accountRef: string): Promise<SetupRecord | null>;

  /** Every valid record. A damaged one is left out; `read` reports it. */
  list(): Promise<SetupRecord[]>;

  /**
   * Applies one edit, stamped with the clock, and returns the new record.
   *
   * @throws SetupRecordError `not-found`, `damaged`, or `refused` when the
   *   edit would make an invalid record; nothing is written then
   */
  update(accountRef: string, edit: SetupEdit): Promise<SetupRecord>;

  /** The records whose client secret is the one under this ref: "Used by x and y". */
  usingClient(clientRef: string): Promise<SetupRecord[]>;

  /**
   * Saves a refused token refresh, so no run refreshes again (design 5.2).
   * `signInRefused` marks this account. `clientRefused` marks every account
   * that uses the same client, in one write, so a crash can't leave some of
   * them free to refresh. An account never moves to a reason that needs less
   * to fix (`strictestRefusal`).
   *
   * @returns the marked records, so the host can set each connector's badge
   * @throws SetupRecordError `not-found` or `damaged`
   */
  refreshRefused(accountRef: string, refusal: RefreshRefusal): Promise<SetupRecord[]>;

  /**
   * Clears a `client` refusal on every account that uses this client, in one
   * write, after Google accepted a new secret ("one new secret fixes them
   * all", design 4.3). A `sign-in` or `client-gone` refusal stays.
   *
   * @returns the cleared records
   */
  clientSecretAccepted(clientRef: string): Promise<SetupRecord[]>;

  /**
   * Lets a personal account use the working app of another personal account
   * (design 3.6, last bullet): the same project, client ID and client secret
   * ref, so a rotation is done once. Steps 1–6 are done; the account still
   * signs in itself.
   *
   * @throws SetupRecordError `not-found`, `damaged`, or `cannot-share` when
   *   either account isn't personal, the other app isn't set up and working,
   *   or this account already has a client ID, client secret or sign-in
   */
  shareClient(accountRef: string, fromAccountRef: string): Promise<SetupRecord>;

  /**
   * Removes the record, also a damaged one, and compacts `_google_setups` so
   * its old values leave the record store's storage. Not an error when there
   * is no record. It removes no secret: `startOver` does both.
   */
  remove(accountRef: string): Promise<void>;
}

/**
 * The setup records over a `RecordStore`.
 *
 * @example
 * const setups = setupRecords({ records, clock, ids });
 * const { accountRef } = await setups.start({ route, accountType: "personal" });
 * await setups.update(accountRef, { kind: "step-done", step: "project" });
 */
export function setupRecords(options: SetupRecordsOptions): SetupRecords {
  const { records, clock, ids } = options;
  const stored = storedSetups(records);

  return {
    async start(setup) {
      const now = clock.now().toISOString();
      const values: SetupValues = {
        route: setup.route,
        accountType: setup.accountType,
        startedAt: now,
        projectId: null,
        stepsDone: {},
        inProductionTickedAt: null,
        clientId: null,
        clientSecret: null,
        signInStartedAt: null,
        lastSignInAt: null,
        services: {},
        refreshRefused: null,
      };
      const accountRef = ids.next(accountRefPrefix);
      await records.append([
        { at: now, collection: setupCollection, id: accountRef, op: "add", values },
      ]);
      return { accountRef, ...values };
    },

    async read(accountRef) {
      const values = await stored.readValid(accountRef);
      return values === null ? null : { accountRef, ...values };
    },

    list: () => stored.listValid(),

    async update(accountRef, edit) {
      const values = await stored.readExisting(accountRef);
      // The schema drops a `__proto__` key instead of refusing it, so the
      // service id is checked here first.
      if (edit.kind === "service-checked" && !isServiceId(edit.service)) {
        throw new SetupRecordError("refused");
      }
      const now = clock.now().toISOString();
      return stored.write(accountRef, values, editedValues(values, edit, now), now);
    },

    usingClient: (clientRef) => stored.usingClient(clientRef),

    refreshRefused: (accountRef, refusal) => saveRefreshRefused(stored, clock, accountRef, refusal),

    clientSecretAccepted: (clientRef) => clearClientRefusals(stored, clock, clientRef),

    shareClient: (accountRef, fromAccountRef) =>
      shareClient(stored, clock, accountRef, fromAccountRef),

    async remove(accountRef) {
      if (!isSetupRef(accountRef)) {
        throw new SetupRecordError("not-found");
      }
      if (!(await stored.has(accountRef))) {
        return;
      }
      await records.append([
        {
          at: clock.now().toISOString(),
          collection: setupCollection,
          id: accountRef,
          op: "remove",
          values: null,
        },
      ]);
      await records.compact(setupCollection);
    },
  };
}
