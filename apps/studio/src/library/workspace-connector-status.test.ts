import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { SetupRecord } from "@halonicjs/google-setup";
import type { ChatTurnRefusal, DefinitionWatchListener } from "@halonicjs/ports";
import type { GoogleSetupAccount } from "@halonicjs/studio-feature-google-setup/api";
import { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceConnectorStatus } from "./workspace-connector-status.ts";

const searchFile = [
  "version: 1",
  "id: search",
  "name: Web search",
  "transport: { http: { url: https://search.acme.example/mcp } }",
].join("\n");

const googleFile = [
  "version: 1",
  "id: mail",
  "transport: { google: { account: sam@acme.example } }",
].join("\n");

/** Acme's files: a search connector, a Google connector and one connector without a name. */
function acmeFiles(): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/search.connector.yaml": searchFile,
    "library/connectors/mail.connector.yaml": googleFile,
    "library/connectors/notes.connector.yaml": searchFile
      .replace("id: search", "id: notes")
      .replace("name: Web search\n", ""),
  });
}

const noGoogle = { list: async () => [], subscribe: () => () => {} };

/** Sam's account for the `mail` connector, with the record fields a test changes. */
function samsAccount(extra: Partial<SetupRecord>): GoogleSetupAccount {
  const record: SetupRecord = {
    accountRef: "gaccount_1",
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    startedAt: "2026-11-12T01:00:00.000Z",
    connector: { workspace: "0123456789abcdef0123456789abcdef", id: "mail" },
    projectId: null,
    stepsDone: {},
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
  return {
    email: "sam@acme.example",
    record,
    services: [],
    adding: [],
    routinesOnHold: 0,
    changedAt: record.startedAt,
    askAccountType: false,
    clientSharedWith: [],
  };
}

const refusal: ChatTurnRefusal = {
  source: "search",
  name: "send_mail",
  refused: "tool",
  reason: "Sending is off for this connector.",
};

verifies("studio.workspace-connector-status", () => {
  it("lists the connector files by name", async () => {
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(),
      refusals: new RefusalsFeed(),
      google: noGoogle,
    });

    const listed = await status.list();

    expect(listed.map(({ id, name, state }) => ({ id, name, state }))).toEqual([
      { id: "mail", name: "mail", state: "not-connected" },
      { id: "notes", name: "notes", state: "connected" },
      { id: "search", name: "Web search", state: "connected" },
    ]);
  });

  it("gives a Google connector the state of its account's setup record", async () => {
    const signedIn = "2026-11-12T02:10:00.000Z";
    const states = async (extra: Partial<SetupRecord>) => {
      const status = new WorkspaceConnectorStatus({
        definitions: acmeFiles(),
        refusals: new RefusalsFeed(),
        google: { ...noGoogle, list: async () => [samsAccount(extra)] },
      });
      return (await status.list()).find(({ id }) => id === "mail")?.state;
    };

    expect(await states({})).toBe("not-connected");
    expect(await states({ lastSignInAt: signedIn })).toBe("connected");
    expect(
      await states({
        lastSignInAt: signedIn,
        refreshRefused: { at: signedIn, reason: "sign-in" },
      }),
    ).toBe("needs-sign-in");
    expect(
      await states({
        lastSignInAt: signedIn,
        refreshRefused: { at: signedIn, reason: "client" },
      }),
    ).toBe("needs-new-secret");
  });

  it("doesn't read the Google accounts when the workspace has no Google connector", async () => {
    const list = vi.fn(async () => []);
    const files = new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "library/connectors/search.connector.yaml": searchFile,
    });
    const status = new WorkspaceConnectorStatus({
      definitions: files,
      refusals: new RefusalsFeed(),
      google: { ...noGoogle, list },
    });

    await status.list();

    expect(list).not.toHaveBeenCalled();
  });

  it("gives the refusals recorded for a connector and tells its listeners", async () => {
    const refusals = new RefusalsFeed();
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(),
      refusals,
      google: noGoogle,
    });
    const heard = vi.fn();
    const stop = status.subscribe(heard);

    refusals.record([refusal]);

    expect(heard).toHaveBeenCalledTimes(1);
    expect((await status.refusals("search")).map((each) => each.refusal)).toEqual([refusal]);
    expect(await status.refusals("notes")).toEqual([]);
    stop();
    refusals.record([refusal]);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("tells its listeners when a Google account's setup changes", () => {
    let changed: () => void = () => {};
    const stopGoogle = vi.fn();
    const status = new WorkspaceConnectorStatus({
      definitions: acmeFiles(),
      refusals: new RefusalsFeed(),
      google: {
        list: async () => [],
        subscribe: (listener) => {
          changed = listener;
          return stopGoogle;
        },
      },
    });
    const heard = vi.fn();
    const stop = status.subscribe(heard);

    changed();

    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    expect(stopGoogle).toHaveBeenCalledTimes(1);
  });

  it("tells its listeners when the window comes to the front and when a file changes", async () => {
    const files = acmeFiles();
    let changed: DefinitionWatchListener | undefined;
    const closed = vi.fn(async () => {});
    vi.spyOn(files, "watch").mockImplementation(async (listener) => {
      changed = listener;
      return { close: closed };
    });
    let focus: () => void = () => {};
    const stopFocus = vi.fn();
    const status = new WorkspaceConnectorStatus({
      definitions: files,
      refusals: new RefusalsFeed(),
      google: noGoogle,
      onFocus: (listener) => {
        focus = listener;
        return stopFocus;
      },
    });
    const heard = vi.fn();
    const stop = status.subscribe(heard);
    await vi.waitFor(() => expect(changed).toBeDefined());

    focus();
    changed?.changed([{ path: "library/connectors/new.connector.yaml", kind: "changed" }]);
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    expect(stopFocus).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  });

  it("keeps listening to the window when the files can't be watched", async () => {
    const files = acmeFiles();
    vi.spyOn(files, "watch").mockRejectedValue(new Error("no watch"));
    let focus: () => void = () => {};
    const status = new WorkspaceConnectorStatus({
      definitions: files,
      refusals: new RefusalsFeed(),
      google: noGoogle,
      onFocus: (listener) => {
        focus = listener;
        return () => {};
      },
    });
    const heard = vi.fn();
    const stop = status.subscribe(heard);

    focus();

    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reports why the files can't be watched, and when the watch fails later", async () => {
    const files = acmeFiles();
    const openFailure = new Error("no watch");
    const laterFailure = new Error("watch lost");
    let listener: DefinitionWatchListener | undefined;
    const watch = vi.spyOn(files, "watch");
    watch.mockRejectedValueOnce(openFailure);
    watch.mockImplementationOnce(async (given) => {
      listener = given;
      return { close: async () => {} };
    });
    const reported = vi.fn();
    const status = new WorkspaceConnectorStatus({
      definitions: files,
      refusals: new RefusalsFeed(),
      google: noGoogle,
      onWatchError: reported,
    });

    const stopFirst = status.subscribe(() => {});
    await vi.waitFor(() => expect(reported).toHaveBeenCalledWith(openFailure));
    stopFirst();
    const stopSecond = status.subscribe(() => {});
    await vi.waitFor(() => expect(listener).toBeDefined());
    listener?.failed(laterFailure);

    expect(reported).toHaveBeenCalledWith(laterFailure);
    stopSecond();
  });
});
