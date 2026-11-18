import { workspaceFilesKey } from "@halonicjs/app";
import {
  GoogleSetupAccountsService,
  GoogleSetupSourceService,
} from "@halonicjs/studio-feature-google-setup/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures } from "../studio/desktop-features.ts";
import { openFolder } from "../studio/start-studio.ts";

const acmeKey = "a".repeat(32);

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "library/connectors/mail.connector.yaml":
    "version: 1\nid: mail\ntransport: { google: { account: sam@acme.example } }\n",
};

/** Acme's ledger integration: a sheet that asks Google for one scope. Invented. */
const ledgerSheet = [
  "id: ledger",
  "version: 1.0.0",
  "kit: 2",
  "provides: [connector]",
  "hosts: [ledger.googleapis.com]",
  "secrets:",
  "  google-account:",
  "    purpose: Access to your Google account.",
  "    hosts: [ledger.googleapis.com]",
  "    as: bearer",
  "googleScopes:",
  "  - scope: https://www.googleapis.com/auth/ledger",
  "    reason: Reads your ledger",
  "googleApis:",
  "  - api: ledger.googleapis.com",
  "    name: Ledger API",
  "",
].join("\n");
const sheetPath = "integrations/ledger/integration.yaml";

/** The folder's entries under `dir`, as the shell lists them: the ledger integration only. */
function folderEntries(dir: unknown) {
  const sheet = { path: sheetPath, kind: "file", size: ledgerSheet.length };
  if (dir === "integrations") return [{ path: "integrations/ledger", kind: "folder" }, sheet];
  if (dir === "integrations/ledger") return [sheet];
  return [];
}

/** The setup record the CLI saved for Acme's `mail`, as a line of the profile's log. */
const recordLine = `${JSON.stringify({
  at: "2026-11-12T02:10:00.000Z",
  collection: "_google_setups",
  id: "gaccount_1",
  op: "add",
  values: {
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    startedAt: "2026-11-12T02:10:00.000Z",
    connector: { workspace: acmeKey, id: "mail" },
    projectId: null,
    stepsDone: {},
    inProductionTickedAt: null,
    clientId: null,
    clientSecret: null,
    signInStartedAt: null,
    lastSignInAt: null,
    services: {},
    refreshRefused: null,
  },
})}\n`;

/** How the shell answers each command Acme's window calls; a command not listed answers nothing. */
const answers: Record<string, (args: Record<string, unknown>) => unknown> = {
  fs_list: () => Object.keys(files),
  fs_read: (args) => files[String(args["path"])] ?? null,
  fs_watch: () => ({ watchId: 1 }),
  workspace_key: () => ({ key: acmeKey }),
  google_setup_read: () => ({ lines: recordLine, file: "setups.jsonl" }),
  folder_entries: (args) => folderEntries(args["dir"]),
  folder_read: (args) =>
    args["path"] === sheetPath ? Buffer.from(ledgerSheet).toString("base64url") : null,
  host_settings_read: () => ({}),
  run_logs: () => [],
};

/** Tauri's IPC for Acme: its files, its key in the profile and the CLI's setup records. */
function acmeWebview() {
  const invoke = async (command: string, args: Record<string, unknown> = {}) =>
    answers[command]?.(args) ?? null;
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { __TAURI_INTERNALS__: internals };
}

verifies("studio.workspace-google-setup-accounts", () => {
  it("registers the Google setup feature and its service in the desktop app", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    expect(shell.features.map((feature) => feature.id)).toContain("google-setup");
    expect(desktopFeatures.hostServices).toContain(GoogleSetupAccountsService);
  });

  it("shows an opened folder's Google setup in the Inbox, and refuses a change in plain words", async () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });
    const display = new DisplaySettings(
      new BrowserDisplayPrefs({ getItem: () => null, setItem: () => {} }, new EventTarget()),
    );
    const opened = await openFolder(shell, acmeWebview(), "/work/acme", display);

    const entries = await opened.workspace.services.get(GoogleSetupSourceService).list();
    await expect(
      opened.workspace.services.get(GoogleSetupAccountsService).checkAgain("gaccount_1"),
    ).rejects.toThrow("Studio can't save this change yet");

    expect(entries.map(({ title }) => title)).toEqual(["Set up Google for sam@acme.example"]);
    expect(opened.workspace.services.has(workspaceFilesKey)).toBe(true);
    await opened.dispose();
  });
});
