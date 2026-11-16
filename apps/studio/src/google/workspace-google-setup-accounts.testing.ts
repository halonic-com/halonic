import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import {
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemoryRecordStore,
} from "@halonicjs/adapter-memory";
import { type SetupRecords, setupRecords } from "@halonicjs/google-setup";
import { fixedClock, fixedIds } from "@halonicjs/std";
import {
  type GoogleSetupHost,
  WorkspaceGoogleSetupAccounts,
} from "./workspace-google-setup-accounts.ts";

export const acmeKey = "a".repeat(32);
export const otherKey = "b".repeat(32);

/** A Google sheet: reads Acme's ledger. Invented, so the test proves the app knows no service. */
export const ledgerSheet = `id: ledger
version: 1.0.0
kit: 2
provides: [connector]
hosts: [ledger.googleapis.com]
secrets:
  google-account:
    purpose: Access to your Google account.
    hosts: [ledger.googleapis.com]
    as: bearer
googleScopes:
  - scope: https://www.googleapis.com/auth/ledger
    reason: Reads your ledger
googleApis:
  - api: ledger.googleapis.com
    name: Ledger API
`;

export const plainSheet = ledgerSheet
  .replace("id: ledger", "id: plain")
  .replace(/googleScopes:[\s\S]*$/, "");

export function connector(id: string, address: string): string {
  return `version: 1\nid: ${id}\ntransport: { google: { account: ${address} } }\n`;
}

export function acmeDefinitions(): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml": connector("mail", "sam@acme.example"),
    "library/connectors/files.connector.yaml": connector("files", "kim@acme.example"),
    "library/connectors/bare.connector.yaml": connector("bare", "lee@acme.example"),
    "library/connectors/search.connector.yaml":
      "version: 1\nid: search\ntransport: { http: { url: https://search.acme.example/mcp } }\n",
  });
}

export function acmeFolder(
  sheets: Record<string, string> = { ledger: ledgerSheet, plain: plainSheet },
) {
  const folder = new MemoryFolderReader();
  folder.putFolder("integrations");
  for (const [name, sheet] of Object.entries(sheets)) {
    folder.putFolder(`integrations/${name}`);
    folder.putFile(`integrations/${name}/integration.yaml`, sheet);
  }
  return folder;
}

export async function accountsOf(
  options: {
    definitions?: MemoryDefinitionStore;
    folder?: MemoryFolderReader;
    start?: (workspace: string, id: string) => Promise<void>;
    host?: GoogleSetupHost | ((setups: SetupRecords) => GoogleSetupHost);
  } = {},
) {
  const records = new MemoryRecordStore();
  const setups = setupRecords({
    records,
    clock: fixedClock(Date.UTC(2026, 10, 12, 2)),
    ids: fixedIds(),
  });
  for (const [workspace, id] of [
    [acmeKey, "mail"],
    [acmeKey, "files"],
    [otherKey, "bare"],
  ] as const) {
    await setups.start({
      route: { app: "own", runsOn: "this-computer" },
      accountType: "personal",
      connector: { workspace, id },
    });
  }
  const accounts = new WorkspaceGoogleSetupAccounts({
    definitions: options.definitions ?? acmeDefinitions(),
    folder: options.folder ?? acmeFolder(),
    digest: webCryptoDigest,
    setups,
    workspaceKey: async () => acmeKey,
    ...(options.host === undefined
      ? {}
      : { host: typeof options.host === "function" ? options.host(setups) : options.host }),
  });
  return { accounts, setups, records };
}

/** A host that is asked only for what a test names; anything else is a mistake of the test. */
export function hostWith(part: Partial<GoogleSetupHost>): GoogleSetupHost {
  const unasked = async (): Promise<never> => {
    throw new Error("This test didn't expect the host to be asked.");
  };
  return {
    disconnect: unasked,
    start: unasked,
    edit: unasked,
    saveClientSecret: unasked,
    replaceClientSecret: unasked,
    startOver: unasked,
    startSignIn: unasked,
    cancelSignIn: unasked,
    ...part,
  };
}
