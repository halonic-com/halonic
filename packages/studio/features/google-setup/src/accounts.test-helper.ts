import type { SetupEdit, SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { GoogleSetupAccount, GoogleSetupAccounts } from "./api.ts";

// Invented services, so the tests prove Studio doesn't know Gmail or Drive.

export const ledger: SetupService = {
  id: "ledger",
  label: "Ledger",
  googleApis: [{ api: "ledger.googleapis.com", name: "Ledger API" }],
  googleScopes: [{ scope: "https://www.googleapis.com/auth/ledger", reason: "Reads your ledger" }],
};

export const atlas: SetupService = {
  id: "atlas",
  label: "Atlas",
  googleApis: [{ api: "atlas.googleapis.com", name: "Atlas API" }],
  googleScopes: [{ scope: "https://www.googleapis.com/auth/atlas", reason: "Reads your maps" }],
};

const at = "2026-11-12T02:10:00.000Z";

/** A record with the given steps done, as `setupRecords` would keep it. */
export function record(done: readonly string[], extra: Partial<SetupRecord> = {}): SetupRecord {
  return {
    accountRef: "gaccount_1",
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    startedAt: at,
    projectId: null,
    stepsDone: Object.fromEntries(done.map((id) => [id, at])),
    inProductionTickedAt: null,
    clientId: null,
    clientSecret: null,
    signInStartedAt: null,
    lastSignInAt: null,
    services: {},
    refreshRefused: null,
    ...extra,
  };
}

/** The account `x@example.com` whose setup is `setup`. */
export function account(
  setup: SetupRecord,
  extra: Partial<GoogleSetupAccount> = {},
): GoogleSetupAccount {
  return {
    email: "x@example.com",
    record: setup,
    services: [ledger],
    adding: [],
    routinesOnHold: 0,
    changedAt: at,
    askAccountType: false,
    ...extra,
  };
}

/** Accounts whose list a test sets, telling the source as a host does. */
export function fakeAccounts(initial: readonly GoogleSetupAccount[]) {
  let accounts = initial;
  const listeners = new Set<() => void>();
  const edits: { accountRef: string; edit: SetupEdit }[] = [];
  const source: GoogleSetupAccounts = {
    list: async () => accounts,
    edit: async (accountRef, edit) => {
      edits.push({ accountRef, edit });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    listeners,
    /** Every edit the view asked to save, in order. */
    edits,
    change: (next: readonly GoogleSetupAccount[]) => {
      accounts = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
