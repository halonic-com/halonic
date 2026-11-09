import { foldRecords, type RecordStore } from "@halonicjs/ports";
import type { RecordUpdate } from "./refresh-refused.ts";
import {
  parseSetupValues,
  type SetupRecord,
  type SetupValues,
  setupCollection,
} from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import { isSetupRef } from "./store-names.ts";

/**
 * Reads and checked writes of the setup records in `_google_setups`. Every
 * value read is parsed, and every value written is checked first, so the
 * methods of `SetupRecords` never see or make an invalid record.
 */
export interface StoredSetups {
  /** Whether a record is stored under the ref, also a damaged one. */
  has(accountRef: string): Promise<boolean>;

  /**
   * The values for an account ref, or `null` when there is none.
   *
   * @throws SetupRecordError `not-found` when the ref isn't a setup ref,
   *   `damaged` when the stored record isn't valid
   */
  readValid(accountRef: string): Promise<SetupValues | null>;

  /**
   * Like `readValid`, but a missing record is an error.
   *
   * @throws SetupRecordError `not-found` or `damaged`
   */
  readExisting(accountRef: string): Promise<SetupValues>;

  /** Every valid record. A damaged one is left out. */
  listValid(): Promise<SetupRecord[]>;

  /** The valid records whose client secret is the one under this ref. */
  usingClient(clientRef: string): Promise<SetupRecord[]>;

  /**
   * Checks the records the changes make, then writes the checked values only,
   * every record in one append. Nothing is written when one is refused, and
   * an update with no changes writes nothing but still gives its record back.
   *
   * @throws SetupRecordError `refused` when a change would make an invalid record
   */
  writeAll(updates: readonly RecordUpdate[], now: string): Promise<SetupRecord[]>;

  /**
   * `writeAll` for one record.
   *
   * @throws SetupRecordError `refused` when the change would make an invalid record
   */
  write(
    accountRef: string,
    values: SetupValues,
    changes: Partial<SetupValues>,
    now: string,
  ): Promise<SetupRecord>;
}

/** The stored setups over a `RecordStore`. */
export function storedSetups(records: RecordStore): StoredSetups {
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

  const writeAll = async (
    updates: readonly RecordUpdate[],
    now: string,
  ): Promise<SetupRecord[]> => {
    const checked = updates.map(({ record: { accountRef, ...values }, changes }) => {
      const updated = parseSetupValues({ ...values, ...changes });
      if (updated === undefined) {
        throw new SetupRecordError("refused");
      }
      const checkedChanges = Object.fromEntries(
        Object.keys(changes).map((key) => [key, updated[key as keyof SetupValues]]),
      );
      return { record: { accountRef, ...updated }, checkedChanges };
    });
    const changed = checked.filter(({ checkedChanges }) => Object.keys(checkedChanges).length > 0);
    if (changed.length > 0) {
      await records.append(
        changed.map(({ record, checkedChanges }) => ({
          at: now,
          collection: setupCollection,
          id: record.accountRef,
          op: "update" as const,
          values: checkedChanges,
        })),
      );
    }
    return checked.map(({ record }) => record);
  };

  return {
    async has(accountRef) {
      return (await storedValues()).has(accountRef);
    },

    readValid,

    async readExisting(accountRef) {
      const values = await readValid(accountRef);
      if (values === null) {
        throw new SetupRecordError("not-found");
      }
      return values;
    },

    listValid,

    async usingClient(clientRef) {
      return (await listValid()).filter((setup) => setup.clientSecret?.clientRef === clientRef);
    },

    writeAll,

    async write(accountRef, values, changes, now) {
      const [written] = await writeAll([{ record: { accountRef, ...values }, changes }], now);
      // writeAll gives one record per update, so this is only for the type checker.
      if (written === undefined) {
        throw new SetupRecordError("refused");
      }
      return written;
    },
  };
}
