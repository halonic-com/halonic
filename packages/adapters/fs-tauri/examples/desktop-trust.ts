import { type TauriShell, TauriTrustStore } from "../src/index.ts";

/**
 * A stand-in for the desktop shell, which isn't there in a test: it keeps
 * records in memory by location. The real shell keeps them in the profile's
 * `trust` folder, and saves a grant only for a folder the person chose.
 */
function exampleShell(): TauriShell {
  const records = new Map<string, unknown>();
  return {
    invoke: async (command, args) => {
      if (command === "trust_grant") {
        const record = args?.["record"] as { location: string };
        records.set(record.location, record);
        return null;
      }
      if (command === "trust_revoke") {
        records.delete(String(args?.["location"]));
        return null;
      }
      if (command === "trust_list") {
        return [...records.values()];
      }
      return records.get(String(args?.["location"])) ?? null;
    },
  };
}

/** Trusts a workspace, reads the record back, lists it and revokes it. */
export async function runExample(): Promise<{
  fingerprint: string | undefined;
  listed: string[];
  afterRevoke: unknown;
}> {
  // In the desktop app this is `window.__TAURI_INTERNALS__`.
  const store = new TauriTrustStore(exampleShell());

  await store.grant({
    location: "/workspaces/acme",
    fingerprint: "hfp1:9f86d081",
    content: { programs: [] },
    grantedAt: "2026-11-10T10:00:00.000Z",
    appVersion: "0.1.0",
    pins: {},
    origin: "prompt",
  });

  const fingerprint = (await store.get("/workspaces/acme"))?.fingerprint; // "hfp1:9f86d081"
  const listed = (await store.list()).map((record) => record.location); // ["/workspaces/acme"]

  await store.revoke("/workspaces/acme");
  const afterRevoke = await store.get("/workspaces/acme"); // null

  return { fingerprint, listed, afterRevoke };
}
