import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import {
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemoryRecordStore,
} from "@halonicjs/adapter-memory";
import { type SetupRecord, setupRecords } from "@halonicjs/google-setup";
import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceGoogleSetupAccounts } from "./workspace-google-setup-accounts.ts";

const acmeKey = "a".repeat(32);
const otherKey = "b".repeat(32);

/** A Google sheet: reads Acme's ledger. Invented, so the test proves the app knows no service. */
const ledgerSheet = `id: ledger
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

const plainSheet = ledgerSheet
  .replace("id: ledger", "id: plain")
  .replace(/googleScopes:[\s\S]*$/, "");

function connector(id: string, address: string): string {
  return `version: 1\nid: ${id}\ntransport: { google: { account: ${address} } }\n`;
}

function acmeDefinitions(): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml": connector("mail", "sam@acme.example"),
    "library/connectors/files.connector.yaml": connector("files", "kim@acme.example"),
    "library/connectors/bare.connector.yaml": connector("bare", "lee@acme.example"),
    "library/connectors/search.connector.yaml":
      "version: 1\nid: search\ntransport: { http: { url: https://search.acme.example/mcp } }\n",
  });
}

function acmeFolder(sheets: Record<string, string> = { ledger: ledgerSheet, plain: plainSheet }) {
  const folder = new MemoryFolderReader();
  folder.putFolder("integrations");
  for (const [name, sheet] of Object.entries(sheets)) {
    folder.putFolder(`integrations/${name}`);
    folder.putFile(`integrations/${name}/integration.yaml`, sheet);
  }
  return folder;
}

async function accountsOf(
  options: {
    definitions?: MemoryDefinitionStore;
    folder?: MemoryFolderReader;
    start?: (workspace: string, id: string) => Promise<void>;
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
  });
  return { accounts, setups, records };
}

verifies("studio.workspace-google-setup-accounts", () => {
  it("lists an account for each Google connector that has a record linked to this workspace", async () => {
    const { accounts } = await accountsOf();

    const listed = await accounts.list();

    expect(listed.map(({ email, record }) => [email, record.connector])).toEqual([
      ["kim@acme.example", { workspace: acmeKey, id: "files" }],
      ["sam@acme.example", { workspace: acmeKey, id: "mail" }],
    ]);
  });

  it("leaves out a connector whose only record is another workspace's, and one with no record", async () => {
    const { accounts } = await accountsOf();

    const emails = (await accounts.list()).map(({ email }) => email);

    expect(emails).not.toContain("lee@acme.example");
  });

  it("takes the services from the sheets that ask for Google scopes", async () => {
    const { accounts } = await accountsOf();

    const [account] = await accounts.list();

    expect(account?.services.map(({ id, googleApis }) => [id, googleApis[0]?.api])).toEqual([
      ["ledger", "ledger.googleapis.com"],
    ]);
    expect(account?.adding).toEqual([]);
  });

  it("puts a sheet added after sign-in under adding, not under services", async () => {
    const { setups } = await accountsOf();
    const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
    await setups.update(mail.accountRef, {
      kind: "client-id",
      clientId: "1234-abc.apps.googleusercontent.com",
    });
    await setups.update(mail.accountRef, { kind: "client-secret-saved", clientRef: "gclient_1" });
    await setups.update(mail.accountRef, { kind: "sign-in-started" });
    await setups.update(mail.accountRef, { kind: "signed-in" });
    await setups.update(mail.accountRef, {
      kind: "service-checked",
      service: "ledger",
      result: { kind: "works" },
    });
    const folder = acmeFolder({
      ledger: ledgerSheet,
      atlas: ledgerSheet.replace("id: ledger", "id: atlas"),
    });

    const listed = await new WorkspaceGoogleSetupAccounts({
      definitions: acmeDefinitions(),
      folder,
      digest: webCryptoDigest,
      setups,
      workspaceKey: async () => acmeKey,
    }).list();
    const account = listed.find(({ email }) => email === "sam@acme.example");

    expect(account?.services.map(({ id }) => id)).toEqual(["ledger"]);
    expect(account?.adding.map(({ id }) => id)).toEqual(["atlas"]);
  });

  it("asks the account type for an address it can't tell, until the setup has progress", async () => {
    const { accounts, setups } = await accountsOf();
    expect((await accounts.list()).every(({ askAccountType }) => askAccountType)).toBe(true);

    const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
    await setups.update(mail.accountRef, { kind: "step-done", step: "project" });

    const listed = await accounts.list();
    expect(listed.map(({ email, askAccountType }) => [email, askAccountType])).toEqual([
      ["kim@acme.example", true],
      ["sam@acme.example", false],
    ]);
  });

  it("names the other accounts of this workspace that use the same client", async () => {
    const { accounts, setups } = await accountsOf();
    const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
    const files = (await setups.forConnector(acmeKey, "files")) as SetupRecord;
    await setups.update(mail.accountRef, { kind: "client-secret-saved", clientRef: "gclient_1" });
    await setups.update(files.accountRef, { kind: "client-secret-saved", clientRef: "gclient_1" });

    const listed = await accounts.list();

    expect(listed.map(({ email, clientSharedWith }) => [email, clientSharedWith])).toEqual([
      ["kim@acme.example", ["sam@acme.example"]],
      ["sam@acme.example", ["kim@acme.example"]],
    ]);
  });

  it("lists nothing, and never asks for the key, when the workspace has no Google connector", async () => {
    const workspaceKey = vi.fn(async () => acmeKey);
    const { setups } = await accountsOf();
    const accounts = new WorkspaceGoogleSetupAccounts({
      definitions: new MemoryDefinitionStore({ "workspace.yaml": "id: acme\nname: Acme\n" }),
      folder: acmeFolder(),
      digest: webCryptoDigest,
      setups,
      workspaceKey,
    });

    expect(await accounts.list()).toEqual([]);
    expect(workspaceKey).not.toHaveBeenCalled();
  });

  describe("changes", () => {
    it("refuses a step, a secret and Start over with a plain message, and changes no record", async () => {
      const { accounts, records } = await accountsOf();
      const before = JSON.stringify(await records.changes("_google_setups"));

      for (const attempt of [accounts.edit(), accounts.saveClientSecret(), accounts.replaceClientSecret(), accounts.startOver()]) {
        await expect(attempt).rejects.toThrow("can't be saved in the Halonic app yet");
      }

      expect(JSON.stringify(await records.changes("_google_setups"))).toBe(before);
    });
  });

  describe("subscribe", () => {
    it("tells its listeners when the window comes to the front, and stops after the last one leaves", async () => {
      let focus = () => {};
      const stopFocus = vi.fn();
      const { setups } = await accountsOf();
      const accounts = new WorkspaceGoogleSetupAccounts({
        definitions: acmeDefinitions(),
        folder: acmeFolder(),
        digest: webCryptoDigest,
        setups,
        workspaceKey: async () => acmeKey,
        onFocus: (listener) => {
          focus = listener;
          return stopFocus;
        },
      });
      const heard = vi.fn();

      const stop = accounts.subscribe(heard);
      focus();
      expect(heard).toHaveBeenCalledTimes(1);
      stop();

      expect(stopFocus).toHaveBeenCalledTimes(1);
    });

    it("tells its listeners when a connector file changed, and not after the last one leaves", async () => {
      const definitions = acmeDefinitions();
      const { setups } = await accountsOf();
      const accounts = new WorkspaceGoogleSetupAccounts({
        definitions,
        folder: acmeFolder(),
        digest: webCryptoDigest,
        setups,
        workspaceKey: async () => acmeKey,
      });
      const heard = vi.fn();

      const watching = vi.spyOn(definitions, "watch");

      const stop = accounts.subscribe(heard);
      await watching.mock.results[0]?.value;
      definitions.changeOutside({
        "library/connectors/mail.connector.yaml": connector("mail", "sam.new@acme.example"),
      });
      expect(heard).toHaveBeenCalledTimes(1);
      stop();
      await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
      definitions.changeOutside({
        "library/connectors/mail.connector.yaml": connector("mail", "sam@acme.example"),
      });

      expect(heard).toHaveBeenCalledTimes(1);
    });

    it("reports a watch that fails, and goes on", async () => {
      const definitions = acmeDefinitions();
      const failure = new Error("no watch");
      vi.spyOn(definitions, "watch").mockRejectedValue(failure);
      const onWatchError = vi.fn();
      const { setups } = await accountsOf();
      const accounts = new WorkspaceGoogleSetupAccounts({
        definitions,
        folder: acmeFolder(),
        digest: webCryptoDigest,
        setups,
        workspaceKey: async () => acmeKey,
        onWatchError,
      });

      const stop = accounts.subscribe(() => {});
      await vi.waitFor(() => expect(onWatchError).toHaveBeenCalledWith(failure));
      stop();
    });
  });
});
