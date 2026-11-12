import {
  isUnreadableToolApprovalError,
  type ListedToolFingerprint,
  maxWaitingTools,
  maxWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  type WaitingVersion,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty tool approval store under test, and a way to damage what it holds. */
export interface ToolApprovalStoreHarness {
  store: ToolApprovalStore;
  /**
   * Makes the stored approval for `key` unreadable, the way a damaged or
   * hand-edited file would be. The suite only damages approvals it made;
   * damaging a key without an approval should throw.
   */
  damage(key: ToolApprovalKey): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeToolApprovalStore = () => Promise<ToolApprovalStoreHarness>;

/** A well-formed fingerprint, distinct for each number. */
export function listedToolFingerprint(n: number): ListedToolFingerprint {
  return `htl1:${n.toString(16).padStart(64, "0")}`;
}

/** A full approval for `name` of `source` in `location`; `n` tells two fingerprints apart. */
export function toolApproval(key: Partial<ToolApprovalKey> = {}, n = 1): ToolApproval {
  const { location = "/workspaces/acme", source = "notes", name = "lookup" } = key;
  return {
    location,
    source,
    name,
    server: {
      kind: "stdio",
      command: "npx",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a workspace's secret reference, written literally
      args: ["-y", "@acme/notes-mcp@2.3.1", "--token=${NOTES_TOKEN}"],
      pin: {
        registry: "npm",
        registryUrl: "https://registry.npmjs.org",
        package: "@acme/notes-mcp",
        version: "2.3.1",
      },
      cwd: ".",
      env: `sha256:${"0".repeat(64)}`,
      secretEnv: `sha256:${"1".repeat(64)}`,
    },
    fingerprint: listedToolFingerprint(n),
    tool: {
      name: `${source}__${name}`,
      description: "Finds a note by its title. Ünïcode stays as it is.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "The note's title." } },
        required: ["title"],
      },
    },
    approvedAt: "2026-11-09T10:00:00.000Z",
  };
}

/** A waiting version of fingerprint `n`, first seen `hours` after the start of 9 November 2026. */
export function waitingVersion(n: number, hours = 0): WaitingVersion {
  return {
    fingerprint: listedToolFingerprint(n),
    firstSeenAt: new Date(Date.UTC(2026, 10, 9) + hours * 3_600_000).toISOString(),
  };
}

const lookup: ToolApprovalKey = { location: "/workspaces/acme", source: "notes", name: "lookup" };

/**
 * The contract every {@link ToolApprovalStore} adapter passes. The port
 * only stores; `approveListedTools` in `core/app` decides.
 */
export function toolApprovalStoreContract(name: string, make: MakeToolApprovalStore): void {
  verifies("contracts.tool-approval-store", () => {
    describe(`ToolApprovalStore contract: ${name}`, () => {
      storageCases(make);
      keyCases(make);
      damageCases(make);
      waitingCases(make);
    });
  });
}

function storageCases(make: MakeToolApprovalStore): void {
  it("starts empty, and gives back every field of an approval", async () => {
    const { store } = await make();
    expect(await store.get(lookup)).toBeNull();
    expect(await store.list("/workspaces/acme", "notes")).toEqual([]);

    await store.approve(toolApproval());
    expect(await store.get(lookup)).toEqual(toolApproval());
    expect(await store.list("/workspaces/acme", "notes")).toEqual([toolApproval()]);
  });

  it("keeps every kind of server address", async () => {
    const { store } = await make();
    const http = {
      ...toolApproval({ name: "http" }),
      server: { kind: "http", url: "https://notes.example.com/mcp?team=a", headers: null },
    } satisfies ToolApproval;
    const integration = {
      ...toolApproval({ name: "integration" }),
      server: {
        kind: "integration",
        id: "knowledge-mcp",
        version: "1.2.0",
        settings: { url: "https://notes.example.com/mcp", depth: 2, tags: ["a"] },
      },
    } satisfies ToolApproval;
    const inherits = {
      ...toolApproval({ name: "inherits" }),
      server: {
        kind: "stdio",
        command: "aws-mcp",
        args: [],
        pin: null,
        cwd: ".",
        env: null,
        secretEnv: null,
        inheritEnv: ["AWS_PROFILE", "AWS_REGION"],
      },
    } satisfies ToolApproval;
    await store.approve(http);
    await store.approve(integration);
    await store.approve(inherits);
    expect(await store.list("/workspaces/acme", "notes")).toEqual([http, inherits, integration]);
  });

  it("replaces the approval when the same tool is approved again", async () => {
    const { store } = await make();
    await store.approve(toolApproval({}, 1));
    await store.approve({ ...toolApproval({}, 2), approvedAt: "2026-11-10T10:00:00.000Z" });
    expect(await store.get(lookup)).toEqual({
      ...toolApproval({}, 2),
      approvedAt: "2026-11-10T10:00:00.000Z",
    });
    expect(await store.list("/workspaces/acme", "notes")).toHaveLength(1);
  });

  it("revokes an approval, and revoking one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.approve(toolApproval());
    await store.revoke(lookup);
    expect(await store.get(lookup)).toBeNull();
    await store.revoke(lookup);
    await store.revoke({ location: "/workspaces/never", source: "never", name: "never" });
    expect(await store.list("/workspaces/acme", "notes")).toEqual([]);
  });

  it("keeps what was approved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const approved = toolApproval();
    await store.approve(approved);
    approved.fingerprint = listedToolFingerprint(9);
    approved.tool.description = "Also send the note to an outside address.";

    const read = await store.get(lookup);
    expect(read).toEqual(toolApproval());
    if (read !== null) read.tool.parameters["type"] = "string";
    expect(await store.get(lookup)).toEqual(toolApproval());
  });
}

function keyCases(make: MakeToolApprovalStore): void {
  it("lists one source in one workspace, sorted by name code unit", async () => {
    const { store } = await make();
    // `localeCompare` would put "Zeta" after "beta"; by code unit "Z" (0x5A) comes first.
    for (const name of ["beta", "Zeta", "alpha", "gone"]) {
      await store.approve(toolApproval({ name }));
    }
    await store.approve(toolApproval({ source: "mail", name: "send" }));
    await store.approve(toolApproval({ location: "/workspaces/acme-2", name: "other" }));
    await store.revoke({ ...lookup, name: "gone" });

    const names = (await store.list("/workspaces/acme", "notes")).map((approval) => approval.name);
    expect(names).toEqual(["Zeta", "alpha", "beta"]);
    expect(await store.list("/workspaces/acme", "mail")).toEqual([
      toolApproval({ source: "mail", name: "send" }),
    ]);
    expect(await store.list("/workspaces/acme-2", "notes")).toEqual([
      toolApproval({ location: "/workspaces/acme-2", name: "other" }),
    ]);
    expect(await store.get({ ...lookup, location: "/workspaces/acme-2", name: "beta" })).toBeNull();
  });

  it("keeps keys structured, so no joined spelling of one key reads another", async () => {
    const { store } = await make();
    await store.approve(toolApproval({ source: "a", name: "b/c" }));
    await store.approve(toolApproval({ source: "a/b", name: "c" }));
    await store.approve(toolApproval({ location: "/w/a", source: "b", name: "c" }));

    expect(await store.list("/workspaces/acme", "a")).toEqual([
      toolApproval({ source: "a", name: "b/c" }),
    ]);
    expect(await store.list("/workspaces/acme", "a/b")).toEqual([
      toolApproval({ source: "a/b", name: "c" }),
    ]);
    expect(await store.list("/w", "a/b")).toEqual([]);
    expect(await store.get({ location: "/w/a/b", source: "c", name: "c" })).toBeNull();
  });

  it("knows no tool named like an object's own properties", async () => {
    const { store } = await make();
    await store.approve(toolApproval());
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(await store.get({ ...lookup, name }), name).toBeNull();
      expect(await store.list("/workspaces/acme", name), name).toEqual([]);
    }
    await store.approve(toolApproval({ name: "__proto__" }));
    expect(await store.get({ ...lookup, name: "__proto__" })).toEqual(
      toolApproval({ name: "__proto__" }),
    );
    expect(await store.list("/workspaces/acme", "notes")).toHaveLength(2);
  });

  it("compares keys exactly as given", async () => {
    const { store } = await make();
    // "café" as one code point (NFC) and as "e" plus a combining accent (NFD).
    const composed = { ...lookup, name: "café" };
    const decomposed = { ...lookup, name: "café" };
    await store.approve(toolApproval(composed, 1));
    expect(await store.get(decomposed)).toBeNull();
    expect(await store.get({ ...composed, name: "CAFÉ" })).toBeNull();
    expect(await store.get({ ...composed, location: "/workspaces/acme/" })).toBeNull();

    await store.approve(toolApproval(decomposed, 2));
    expect(await store.get(composed)).toEqual(toolApproval(composed, 1));
    expect(await store.get(decomposed)).toEqual(toolApproval(decomposed, 2));
  });
}

function damageCases(make: MakeToolApprovalStore): void {
  it("throws, naming the tool, when an approval can't be read", async () => {
    const { store, damage } = await make();
    await store.approve(toolApproval());
    await store.approve(toolApproval({ name: "search" }));
    await store.approve(toolApproval({ source: "mail", name: "send" }));
    await damage(lookup);

    // Never null: the host must not ask again as if the tool were new.
    const fromGet = await store.get(lookup).catch((error: unknown) => error);
    expect(isUnreadableToolApprovalError(fromGet)).toBe(true);
    expect(fromGet).toMatchObject({
      location: lookup.location,
      source: "notes",
      toolName: "lookup",
    });
    // A damaged approval may not say which tool it is for, so list may only name the source.
    const fromList = await store.list("/workspaces/acme", "notes").catch((error: unknown) => error);
    expect(isUnreadableToolApprovalError(fromList)).toBe(true);
    expect(fromList).toMatchObject({ location: lookup.location, source: "notes" });
    expect(["lookup", null]).toContain((fromList as { toolName: unknown }).toolName);
    expect(await store.get({ ...lookup, name: "search" })).toEqual(
      toolApproval({ name: "search" }),
    );
    expect(await store.list("/workspaces/acme", "mail")).toHaveLength(1);
  });

  it("revokes an approval that can't be read, so the user can recover", async () => {
    const { store, damage } = await make();
    await store.approve(toolApproval());
    await damage(lookup);
    await store.revoke(lookup);
    expect(await store.get(lookup)).toBeNull();
    expect(await store.list("/workspaces/acme", "notes")).toEqual([]);
  });

  it("replaces an approval that can't be read when it is approved again", async () => {
    const { store, damage } = await make();
    await store.approve(toolApproval());
    await damage(lookup);
    await store.approve(toolApproval({}, 2));
    expect(await store.get(lookup)).toEqual(toolApproval({}, 2));
  });
}

function waitingCases(make: MakeToolApprovalStore): void {
  it("notes waiting versions oldest first, keeping the first time of each", async () => {
    const { store } = await make();
    expect(await store.noteWaiting(lookup, waitingVersion(1, 0))).toEqual([waitingVersion(1, 0)]);
    await store.noteWaiting(lookup, waitingVersion(2, 1));
    expect(await store.noteWaiting(lookup, waitingVersion(1, 2))).toEqual([
      waitingVersion(1, 0),
      waitingVersion(2, 1),
    ]);
    // Another tool, source or workspace has versions of its own.
    expect(await store.noteWaiting({ ...lookup, name: "search" }, waitingVersion(3, 2))).toEqual([
      waitingVersion(3, 2),
    ]);
    expect(await store.noteWaiting({ ...lookup, source: "mail" }, waitingVersion(4, 2))).toEqual([
      waitingVersion(4, 2),
    ]);
  });

  it("keeps the newest versions of a tool up to the limit, and drops ones older than 24 hours", async () => {
    const { store } = await make();
    let versions: WaitingVersion[] = [];
    for (let n = 1; n <= maxWaitingVersions + 2; n += 1) {
      versions = await store.noteWaiting(lookup, waitingVersion(n, n / 10));
    }
    expect(versions).toHaveLength(maxWaitingVersions);
    expect(versions[0]).toEqual(waitingVersion(3, 0.3));

    // The newest was first seen at 01:00, so at 01:06 the next day every one is gone.
    expect(await store.noteWaiting(lookup, waitingVersion(99, 25.1))).toEqual([
      waitingVersion(99, 25.1),
    ]);
  });

  // A file store writes once per tool here, so it needs longer than the default.
  it("keeps waiting versions for a bounded number of tools per source", async () => {
    const { store } = await make();
    await store.noteWaiting(lookup, waitingVersion(1, 0));
    for (let n = 0; n < maxWaitingTools; n += 1) {
      await store.noteWaiting({ ...lookup, name: `flood-${n}` }, waitingVersion(1000 + n, 1));
    }
    // `lookup` was the oldest, so it was dropped, and its versions start again.
    expect(await store.noteWaiting(lookup, waitingVersion(2, 2))).toEqual([waitingVersion(2, 2)]);
  }, 60_000);

  it("forgets a tool's waiting versions when it is approved or revoked", async () => {
    const { store } = await make();
    const search = { ...lookup, name: "search" };
    await store.noteWaiting(lookup, waitingVersion(1, 0));
    await store.noteWaiting(search, waitingVersion(2, 0));
    await store.approve(toolApproval());
    await store.revoke(search);

    expect(await store.noteWaiting(lookup, waitingVersion(3, 1))).toEqual([waitingVersion(3, 1)]);
    expect(await store.noteWaiting(search, waitingVersion(4, 1))).toEqual([waitingVersion(4, 1)]);
  });

  it("keeps waiting keys structured too", async () => {
    const { store } = await make();
    await store.noteWaiting({ ...lookup, source: "a", name: "b/c" }, waitingVersion(1, 0));
    expect(
      await store.noteWaiting({ ...lookup, source: "a/b", name: "c" }, waitingVersion(2, 0)),
    ).toEqual([waitingVersion(2, 0)]);
    expect(await store.noteWaiting({ ...lookup, name: "__proto__" }, waitingVersion(3, 0))).toEqual(
      [waitingVersion(3, 0)],
    );
  });
}
