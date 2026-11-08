import type { SetupInput, SetupService } from "./setup-input.ts";

// Invented services, so the tests prove the steps come from the input alone.

/** A service with one restricted scope and a check after sign-in. */
export const ledgerService: SetupService = {
  id: "ledger",
  label: "Ledger",
  googleApis: [{ api: "ledger.googleapis.com", name: "Ledger API" }],
  googleScopes: [
    {
      scope: "https://www.googleapis.com/auth/ledger",
      reason: "Reads and writes your ledger",
      restricted: true,
    },
  ],
  googleCheck: { method: "GET", url: "https://ledger.googleapis.com/v1/me" },
};

/** A service with two APIs, one scope shared with `ledgerService`, and no check. */
export const atlasService: SetupService = {
  id: "atlas",
  label: "Atlas",
  googleApis: [
    { api: "atlas.googleapis.com", name: "Atlas API" },
    { api: "ledger.googleapis.com", name: "Ledger API" },
  ],
  googleScopes: [
    { scope: "https://www.googleapis.com/auth/atlas.readonly", reason: "Reads your maps" },
    { scope: "https://www.googleapis.com/auth/ledger", reason: "Places entries on your maps" },
  ],
};

/** A setup for a personal account with the given services. */
export function personalSetup(services: readonly SetupService[]): SetupInput {
  return {
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    account: "someone@example.com",
    services,
  };
}
