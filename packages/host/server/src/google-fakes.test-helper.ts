import { clientSecretStore, refreshTokenName, setupRecords } from "@halonicjs/google-setup";
import {
  type Clock,
  compactedChanges,
  type RecordChange,
  type RecordStore,
  secretKey,
  type TokenStore,
} from "@halonicjs/ports";
import type {
  GoogleAccountActions,
  GoogleCheckOutcome,
  GoogleCheckRequest,
  GoogleSetupPorts,
  GoogleSetupSubject,
  StagedSecretOutcome,
} from "./api.ts";

// Invented values only. None is real, and none has the GOCSPX- prefix.
export const fakeSecret = "fake-client-secret-0000000001";
export const otherFakeSecret = "fake-client-secret-0000000002";
export const fakeClientId = "1234-abc123.apps.googleusercontent.com";

/** A record store in memory that copies changes in and out, like a real store. */
function memoryRecords(): RecordStore {
  const log: RecordChange[] = [];
  const copied = (changes: readonly RecordChange[]): RecordChange[] =>
    JSON.parse(JSON.stringify(changes)) as RecordChange[];
  return {
    append: async (changes) => {
      log.push(...copied(changes));
    },
    changes: async (collection) => copied(log.filter((change) => change.collection === collection)),
    compact: async (collection) => {
      const kept = log.filter((change) => change.collection !== collection);
      const compacted = compactedChanges(
        collection,
        log.filter((change) => change.collection === collection),
      );
      log.splice(0, log.length, ...kept, ...compacted);
    },
  };
}

/** A token store in memory that tests can look into. */
export interface MemoryTokens extends TokenStore {
  readonly values: Map<string, string>;
}

function memoryTokens(): MemoryTokens {
  const values = new Map<string, string>();
  const canonical = (name: string): string => secretKey(name).toLowerCase();
  return {
    values,
    get: async (name) => values.get(canonical(name)) ?? null,
    set: async (name, value) => {
      values.set(canonical(name), value);
    },
    remove: async (name) => {
      values.delete(canonical(name));
    },
  };
}

export const ledgerSubject: GoogleSetupSubject = {
  account: "someone@example.com",
  services: [
    {
      id: "ledger",
      label: "Ledger",
      googleApis: [{ api: "ledger.googleapis.com", name: "Ledger API" }],
      googleScopes: [
        { scope: "https://www.googleapis.com/auth/ledger", reason: "Reads and writes your ledger" },
      ],
    },
  ],
};

/** What the fake Google actions were asked, so tests can look for who was tested with and what was sent. */
export interface FakeGoogleActions extends GoogleAccountActions {
  readonly stagedChecks: Parameters<GoogleAccountActions["checkStagedSecret"]>[0][];
  readonly checks: GoogleCheckRequest[];
  readonly revoked: string[];
  /** What the next calls answer, until it is set again. */
  stagedOutcome: StagedSecretOutcome;
  checkOutcome: GoogleCheckOutcome;
  revokeConfirmed: boolean;
}

/** Google's side, scripted by the test. A revoke removes the refresh token as the real one does. */
function fakeGoogleActions(tokens: TokenStore): FakeGoogleActions {
  const actions: FakeGoogleActions = {
    stagedChecks: [],
    checks: [],
    revoked: [],
    stagedOutcome: { kind: "accepted" },
    checkOutcome: { kind: "checked", services: [] },
    revokeConfirmed: true,
    checkStagedSecret: async (input) => {
      actions.stagedChecks.push(input);
      return actions.stagedOutcome;
    },
    checkAgain: async (input) => {
      actions.checks.push(input);
      return actions.checkOutcome;
    },
    revoke: async (accountRef) => {
      actions.revoked.push(accountRef);
      const name = refreshTokenName(accountRef);
      if ((await tokens.get(name)) === null) {
        return { kind: "nothingToRevoke" };
      }
      await tokens.remove(name);
      return { kind: "disconnected", googleConfirmed: actions.revokeConfirmed };
    },
  };
  return actions;
}

/** The real setup records and secret store over memory, with a source that names the one ledger subject. */
export function fakeGoogle(
  clock: Clock,
): GoogleSetupPorts & { readonly tokens: MemoryTokens; readonly actions: FakeGoogleActions } {
  const tokens = memoryTokens();
  let nextId = 0;
  const ids = {
    next: (prefix: string) => {
      nextId += 1;
      return `${prefix}_fake${nextId}`;
    },
  };
  return {
    tokens,
    actions: fakeGoogleActions(tokens),
    setups: setupRecords({ records: memoryRecords(), clock, ids }),
    clientSecrets: clientSecretStore(tokens, ids),
    source: { describe: async () => ledgerSubject },
  };
}
