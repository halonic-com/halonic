import type { SetupEdit, SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { SecretText } from "@halonicjs/studio-kit";
import type {
  DisconnectAnswer,
  GoogleSetupAccount,
  GoogleSetupAccounts,
  SecretEntry,
  SecretReplaceAnswer,
} from "./api.ts";

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
    connector: { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" },
    projectId: null,
    stepsDone: Object.fromEntries(done.map((id) => [id, at])),
    inProductionTickedAt: null,
    clientId: null,
    clientSecret: null,
    signInStartedAt: null,
    lastSignInAt: null,
    wrongAccountAt: null,
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
    clientSharedWith: [],
    ...extra,
  };
}

/** The secret field as the desktop app has it. */
export const desktopEntry: SecretEntry = {
  kind: "field",
  keptOn: "this-computer",
  plainHttp: false,
};

/**
 * Accounts whose list a test sets, telling the source as a host does. `entry` is how the secret
 * is entered. `saveSecret` is what saving a secret does: it records the value (a fake, in a test)
 * and may reject. `edit` may reject an edit.
 */
export function fakeAccounts(
  initial: readonly GoogleSetupAccount[],
  options: {
    readonly entry?: SecretEntry;
    readonly saveSecret?: (accountRef: string, value: string) => Promise<void>;
    /** What replacing a secret answers, and may reject. It gets the value, a fake in a test. */
    readonly replaceSecret?: (accountRef: string, value: string) => Promise<SecretReplaceAnswer>;
    /** What disconnecting answers, and may reject. */
    readonly disconnect?: (accountRef: string) => Promise<DisconnectAnswer>;
    /** Runs before an edit is recorded, and may reject: the edit then isn't saved. */
    readonly edit?: (edit: SetupEdit) => Promise<void>;
    /** What starting a sign-in answers with, the address to open, and may reject. */
    readonly startSignIn?: (accountRef: string) => Promise<string>;
    /** Runs when a sign-in is cancelled, and may reject. */
    readonly cancelSignIn?: (accountRef: string) => Promise<void>;
  } = {},
) {
  let accounts = initial;
  const listeners = new Set<() => void>();
  const edits: { accountRef: string; edit: SetupEdit }[] = [];
  const startOvers: string[] = [];
  const disconnects: string[] = [];
  const signIns: string[] = [];
  const cancelled: string[] = [];
  const secrets: { accountRef: string; value: string }[] = [];
  const replacements: { accountRef: string; value: string }[] = [];
  const source: GoogleSetupAccounts = {
    secretEntry: options.entry ?? desktopEntry,
    saveClientSecret: async (accountRef: string, secret: SecretText) => {
      const value = secret.reveal();
      await options.saveSecret?.(accountRef, value);
      secrets.push({ accountRef, value });
    },
    replaceClientSecret: async (accountRef: string, secret: SecretText) => {
      const value = secret.reveal();
      const answer = (await options.replaceSecret?.(accountRef, value)) ?? {
        kind: "accepted" as const,
        usedBy: [],
      };
      replacements.push({ accountRef, value });
      return answer;
    },
    list: async () => accounts,
    edit: async (accountRef, edit) => {
      await options.edit?.(edit);
      edits.push({ accountRef, edit });
    },
    startOver: async (accountRef) => {
      startOvers.push(accountRef);
    },
    disconnect: async (accountRef) => {
      const answer = (await options.disconnect?.(accountRef)) ?? { kind: "ended" as const };
      disconnects.push(accountRef);
      return answer;
    },
    startSignIn: async (accountRef) => {
      signIns.push(accountRef);
      return (await options.startSignIn?.(accountRef)) ?? "https://accounts.example.com/sign-in";
    },
    cancelSignIn: async (accountRef) => {
      await options.cancelSignIn?.(accountRef);
      cancelled.push(accountRef);
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
    /** Every secret the view sent to the secret store, in order. Fake values only. */
    secrets,
    /** Every new secret the view sent to be checked and swapped in, in order. Fake values only. */
    replacements,
    /** The account refs the view asked to start over, in order. */
    startOvers,
    /** The account refs the view asked to disconnect, in order. */
    disconnects,
    /** The account refs the view started a sign-in for, in order. */
    signIns,
    /** The account refs whose sign-in the view cancelled, in order. */
    cancelled,
    change: (next: readonly GoogleSetupAccount[]) => {
      accounts = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
