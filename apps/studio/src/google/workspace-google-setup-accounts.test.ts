import { isDeepStrictEqual } from "node:util";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import {
  MemoryDefinitionStore,
  MemoryFolderReader,
  MemoryRecordStore,
} from "@halonicjs/adapter-memory";
import { type SetupRecord, type SetupRecords, setupRecords } from "@halonicjs/google-setup";
import { fixedClock, fixedIds } from "@halonicjs/std";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  type GoogleSetupHost,
  WorkspaceGoogleSetupAccounts,
} from "./workspace-google-setup-accounts.ts";

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
function hostWith(part: Partial<GoogleSetupHost>): GoogleSetupHost {
  const unasked = async (): Promise<never> => {
    throw new Error("This test didn't expect the host to be asked.");
  };
  return {
    disconnect: unasked,
    start: unasked,
    edit: unasked,
    startOver: unasked,
    startSignIn: unasked,
    cancelSignIn: unasked,
    ...part,
  };
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
    it("refuses a secret, Check again and a new address with a plain message, and changes no record", async () => {
      const { accounts, records } = await accountsOf();
      const before = JSON.stringify(await records.changes("_google_setups"));

      for (const attempt of [
        accounts.saveClientSecret(),
        accounts.replaceClientSecret(),
        accounts.checkAgain(),
        accounts.changeAddress(),
      ]) {
        await expect(attempt).rejects.toThrow("can't be saved in the Halonic app yet");
      }

      expect(JSON.stringify(await records.changes("_google_setups"))).toBe(before);
    });
  });

  describe("changes through the agent host", () => {
    /** A host that does what the real one does to the records, and says what it was asked. */
    function hostOver(setups: SetupRecords, asked: string[]): GoogleSetupHost {
      const route = { app: "own", runsOn: "this-computer" } as const;
      return {
        disconnect: async () => ({ googleConfirmed: true }),
        start: async (connector, accountType) => {
          asked.push(`start ${connector.workspace}/${connector.id} ${accountType}`);
          return (await setups.start({ route, accountType, connector })).accountRef;
        },
        edit: async (accountRef, change) => {
          asked.push(`edit ${accountRef} ${change.kind}`);
        },
        startOver: async (accountRef) => {
          asked.push(`start-over ${accountRef}`);
          await setups.remove(accountRef);
        },
        startSignIn: async (accountRef) => {
          asked.push(`sign-in ${accountRef}`);
          return "https://accounts.example/auth";
        },
        cancelSignIn: async (accountRef) => {
          asked.push(`cancel ${accountRef}`);
        },
      };
    }

    it("starts a setup for a connector with the link to it, and lists it as an account", async () => {
      const asked: string[] = [];
      const { accounts: bare, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });

      const ref = await bare.start("calendar", "workspace");

      expect(asked).toEqual([`start ${acmeKey}/calendar workspace`]);
      expect((await setups.read(ref))?.connector).toEqual({ workspace: acmeKey, id: "calendar" });
    });

    it("keeps the record a connector already has instead of starting a second", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;

      expect(await accounts.start("mail", "personal")).toBe(mail.accountRef);
      expect(asked).toEqual([]);
    });

    it("saves one edit and tells its listeners", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const listener = vi.fn();
      accounts.subscribe(listener);

      await accounts.edit("gaccount_1", { kind: "project-id", projectId: "acme-project" });

      expect(asked).toEqual(["edit gaccount_1 project-id"]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("starts over by removing the record and starting a fresh one for the same connector", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;

      await accounts.startOver(mail.accountRef);

      const fresh = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
      expect(fresh.accountRef).not.toBe(mail.accountRef);
      expect(fresh.accountType).toBe(mail.accountType);
      expect(asked).toEqual([`start-over ${mail.accountRef}`, `start ${acmeKey}/mail personal`]);
    });

    it("starts and cancels a sign-in", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });

      expect(await accounts.startSignIn("gaccount_1")).toBe("https://accounts.example/auth");
      await accounts.cancelSignIn("gaccount_1");

      expect(asked).toEqual(["sign-in gaccount_1", "cancel gaccount_1"]);
    });

    it("rejects in plain words with the host's reason, and tells its listeners to read again, when the host can't", async () => {
      const { accounts } = await accountsOf({
        host: (own) => ({
          ...hostOver(own, []),
          edit: async () => {
            throw new Error("The agent host answered with 502 (google_failed).");
          },
        }),
      });
      const listener = vi.fn();
      accounts.subscribe(listener);

      await expect(accounts.edit("gaccount_1", { kind: "sign-in-dropped" })).rejects.toThrow(
        "Halonic couldn't save this. The agent host answered with 502",
      );
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("says the app needs its agent host when it has none, without the old 'not yet' text", async () => {
      const { accounts } = await accountsOf();

      for (const attempt of [
        accounts.start("mail", "personal"),
        accounts.edit("gaccount_1", { kind: "sign-in-dropped" }),
        accounts.startOver("gaccount_1"),
        accounts.startSignIn("gaccount_1"),
        accounts.cancelSignIn("gaccount_1"),
      ]) {
        await expect(attempt).rejects.toThrow("needs its agent host");
        await expect(attempt).rejects.not.toThrow("yet");
      }
    });
  });

  describe("disconnect", () => {
    it("asks the agent host, answers whether Google ended the sign-in, and tells its listeners", async () => {
      const disconnected: string[] = [];
      const host = {
        disconnect: async (accountRef: string) => {
          disconnected.push(accountRef);
          return { googleConfirmed: true };
        },
      };
      const { accounts } = await accountsOf({ host: hostWith(host) });
      const listener = vi.fn();
      accounts.subscribe(listener);

      const answer = await accounts.disconnect("gaccount_1");

      expect(answer).toEqual({ kind: "ended" });
      expect(disconnected).toEqual(["gaccount_1"]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("says when Google couldn't be reached, as the setup was still removed", async () => {
      const host = { disconnect: async () => ({ googleConfirmed: false }) };
      const { accounts } = await accountsOf({ host: hostWith(host) });

      expect(await accounts.disconnect("gaccount_1")).toEqual({ kind: "google-unreachable" });
    });

    it("rejects in plain words with the host's reason, and tells its listeners to read again, when the host can't", async () => {
      const host = {
        disconnect: async () => {
          throw new Error("The agent host answered with 502 (google_failed).");
        },
      };
      const { accounts } = await accountsOf({ host: hostWith(host) });
      const listener = vi.fn();
      accounts.subscribe(listener);

      await expect(accounts.disconnect("gaccount_1")).rejects.toThrow(
        "Halonic couldn't finish disconnecting this account. The agent host answered with 502",
      );
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("is refused in plain words without an agent host", async () => {
      const { accounts } = await accountsOf();

      await expect(accounts.disconnect("gaccount_1")).rejects.toThrow(
        "can't be saved in the Halonic app yet",
      );
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
      await waitUntil("heard to be called once", () => heard.mock.calls.length === 1);
      expect(heard).toHaveBeenCalledTimes(1);
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
      await waitUntil("onWatchError to be called with failure", () =>
        onWatchError.mock.calls.some((call) => isDeepStrictEqual(call, [failure])),
      );
      expect(onWatchError).toHaveBeenCalledWith(failure);
      stop();
    });
  });
});
