import { type Clock, foldRecords, type IdGenerator, type RecordStore } from "@halonicjs/ports";
import type { AccountType } from "./account-type.ts";
import { editedValues, type SetupEdit } from "./setup-edit.ts";
import type { SetupRoute } from "./setup-input.ts";
import {
  isServiceId,
  parseSetupValues,
  type SetupRecord,
  type SetupValues,
  setupCollection,
} from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import type { StepId } from "./setup-step.ts";
import { accountRefPrefix, isSetupRef } from "./store-names.ts";

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

/** The steps another account's app has already done for a shared client: 1 to 6. */
const stepsDoneBySharedApp = [
  "project",
  "apis",
  "consent",
  "scopes",
  "client",
  "credentials",
] as const satisfies readonly StepId[];

/**
 * Whether the setup already has a client of its own. Sharing would replace
 * its client secret ref, so no record would point to that secret any more,
 * and keep a sign-in whose refresh token belongs to the old client. The user
 * starts the setup over first instead.
 */
function hasOwnClient(values: SetupValues): boolean {
  return values.clientId !== null || values.clientSecret !== null || values.lastSignInAt !== null;
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

  const storedValues = async (): Promise<Map<string, unknown>> => {
    const current = foldRecords(await records.changes(setupCollection));
    return new Map([...current].map(([id, record]) => [id, record.values]));
  };

  const readValid = async (accountRef: string): Promise<SetupValues | null> => {
    if (!isSetupRef(accountRef)) {
      throw new SetupRecordError("not-found");
    }
    const stored = (await storedValues()).get(accountRef);
    if (stored === undefined) {
      return null;
    }
    const values = parseSetupValues(stored);
    if (values === undefined) {
      throw new SetupRecordError("damaged");
    }
    return values;
  };

  const readExisting = async (accountRef: string): Promise<SetupValues> => {
    const values = await readValid(accountRef);
    if (values === null) {
      throw new SetupRecordError("not-found");
    }
    return values;
  };

  /** Checks the record the changes make, then writes the checked values only. */
  const write = async (
    accountRef: string,
    values: SetupValues,
    changes: Partial<SetupValues>,
    now: string,
  ): Promise<SetupRecord> => {
    const updated = parseSetupValues({ ...values, ...changes });
    if (updated === undefined) {
      throw new SetupRecordError("refused");
    }
    const checkedChanges = Object.fromEntries(
      Object.keys(changes).map((key) => [key, updated[key as keyof SetupValues]]),
    );
    await append("update", accountRef, checkedChanges, now);
    return { accountRef, ...updated };
  };

  const listValid = async (): Promise<SetupRecord[]> => {
    const valid: SetupRecord[] = [];
    for (const [accountRef, stored] of await storedValues()) {
      const values = parseSetupValues(stored);
      if (values !== undefined) {
        valid.push({ accountRef, ...values });
      }
    }
    return valid;
  };

  const append = (
    op: "add" | "update",
    accountRef: string,
    values: Partial<SetupValues>,
    at: string,
  ) => records.append([{ at, collection: setupCollection, id: accountRef, op, values }]);

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
      };
      const accountRef = ids.next(accountRefPrefix);
      await append("add", accountRef, values, now);
      return { accountRef, ...values };
    },

    async read(accountRef) {
      const values = await readValid(accountRef);
      return values === null ? null : { accountRef, ...values };
    },

    list: listValid,

    async update(accountRef, edit) {
      const values = await readExisting(accountRef);
      // The schema drops a `__proto__` key instead of refusing it, so the
      // service id is checked here first.
      if (edit.kind === "service-checked" && !isServiceId(edit.service)) {
        throw new SetupRecordError("refused");
      }
      const now = clock.now().toISOString();
      return write(accountRef, values, editedValues(values, edit, now), now);
    },

    async usingClient(clientRef) {
      return (await listValid()).filter((setup) => setup.clientSecret?.clientRef === clientRef);
    },

    async shareClient(accountRef, fromAccountRef) {
      const values = await readExisting(accountRef);
      const from = await readExisting(fromAccountRef);
      // Only a personal account's External app can be shared: a Workspace
      // Internal app doesn't work across organisations (design 3.6).
      const canShare =
        accountRef !== fromAccountRef &&
        values.accountType === "personal" &&
        from.accountType === "personal" &&
        from.inProductionTickedAt !== null &&
        from.clientId !== null &&
        from.clientSecret !== null &&
        from.lastSignInAt !== null &&
        !hasOwnClient(values);
      if (!canShare) {
        throw new SetupRecordError("cannot-share");
      }
      const now = clock.now().toISOString();
      return write(
        accountRef,
        values,
        {
          projectId: from.projectId,
          inProductionTickedAt: from.inProductionTickedAt,
          clientId: from.clientId,
          clientSecret: from.clientSecret,
          stepsDone: {
            ...values.stepsDone,
            ...Object.fromEntries(stepsDoneBySharedApp.map((step) => [step, now])),
          },
        },
        now,
      );
    },

    async remove(accountRef) {
      if (!isSetupRef(accountRef)) {
        throw new SetupRecordError("not-found");
      }
      if (!(await storedValues()).has(accountRef)) {
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
