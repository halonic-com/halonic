import type {
  ConnectionKey,
  ConnectionSettingsRecord,
  ConnectionSettingsStore,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty connection settings store under test, and a way to damage what it holds. */
export interface ConnectionSettingsStoreHarness {
  store: ConnectionSettingsStore;
  /**
   * Makes the stored settings for `key` unreadable, the way a damaged or
   * hand-edited file would be. The suite only damages settings it saved.
   */
  damage(key: ConnectionKey): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeConnectionSettingsStore = () => Promise<ConnectionSettingsStoreHarness>;

/**
 * Settings for `connector` in `location`. The time is one no error may
 * hold: it stands for the contents of a record that can't be read.
 */
export function connectionSettings(
  location: string,
  connector = "mail",
  allowSending = true,
): ConnectionSettingsRecord {
  return { location, connector, allowSending, changedAt: "2026-11-09T10:00:00.000Z" };
}

/** The contract every {@link ConnectionSettingsStore} adapter passes. The port only stores; `ConnectionSettings` decides. */
export function connectionSettingsStoreContract(
  name: string,
  make: MakeConnectionSettingsStore,
): void {
  verifies("contracts.connection-settings-store", () => {
    describe(`ConnectionSettingsStore contract: ${name}`, () => {
      storageCases(make);
      keyCases(make);
      damageCases(make);
    });
  });
}

const acme = { location: "/workspaces/acme", connector: "mail" };

function storageCases(make: MakeConnectionSettingsStore): void {
  it("starts empty, and gives back every field of saved settings", async () => {
    const { store } = await make();
    expect(await store.get(acme)).toBeNull();

    await store.save(connectionSettings("/workspaces/acme"));
    expect(await store.get(acme)).toEqual(connectionSettings("/workspaces/acme"));
  });

  it("replaces the settings when the same key is saved again", async () => {
    const { store } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    const changed = {
      ...connectionSettings("/workspaces/acme", "mail", false),
      changedAt: "2026-11-10T08:30:00.000Z",
    };
    await store.save(changed);
    expect(await store.get(acme)).toEqual(changed);
  });

  it("removes settings, and removing settings that aren't there is not an error", async () => {
    const { store } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    await store.remove(acme);
    expect(await store.get(acme)).toBeNull();
    await store.remove(acme);
    await store.remove({ location: "/workspaces/never", connector: "mail" });
    expect(await store.get(acme)).toBeNull();
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = connectionSettings("/workspaces/acme", "mail", false);
    await store.save(saved);
    saved.allowSending = true;

    const read = await store.get(acme);
    expect(read).toEqual(connectionSettings("/workspaces/acme", "mail", false));
    if (read !== null) read.allowSending = true;
    expect(await store.get(acme)).toEqual(connectionSettings("/workspaces/acme", "mail", false));
  });
}

function keyCases(make: MakeConnectionSettingsStore): void {
  it("keeps settings per location and connector", async () => {
    const { store } = await make();
    await store.save(connectionSettings("/workspaces/acme", "mail"));

    // The same connector in another workspace, and another connector in this one.
    expect(await store.get({ location: "/workspaces/zeta", connector: "mail" })).toBeNull();
    expect(await store.get({ location: "/workspaces/acme", connector: "docs" })).toBeNull();

    await store.save(connectionSettings("/workspaces/zeta", "mail", false));
    await store.save(connectionSettings("/workspaces/acme", "docs", false));
    await store.remove({ location: "/workspaces/zeta", connector: "mail" });
    await store.remove({ location: "/workspaces/acme", connector: "docs" });
    expect(await store.get(acme)).toEqual(connectionSettings("/workspaces/acme", "mail"));
  });

  it("compares locations and connector ids exactly as given", async () => {
    const { store } = await make();
    await store.save(connectionSettings("/workspaces/acme", "mail"));
    // ConnectionSettings resolves the real path first; the store must not
    // guess. "café" with "é" as one code point and as "e" plus an accent.
    const others = [
      { location: "/workspaces/acme/", connector: "mail" },
      { location: "/Workspaces/acme", connector: "mail" },
      { location: "/workspaces/./acme", connector: "mail" },
      { location: "/workspaces/acme", connector: "Mail" },
      { location: "/workspaces/acme", connector: "mail " },
    ];
    for (const other of others) {
      expect(await store.get(other), JSON.stringify(other)).toBeNull();
      await store.remove(other);
    }
    expect(await store.get(acme)).not.toBeNull();

    await store.save(connectionSettings("/workspaces/café"));
    expect(await store.get({ location: "/workspaces/café", connector: "mail" })).toBeNull();
  });

  it("never runs a location into a connector id", async () => {
    const { store } = await make();
    // A store that joins the two with a separator would give these one key,
    // so turning sending on for one would turn it on for the other.
    const first = { location: "/workspaces/acme", connector: "mail:send" };
    const joined = [
      first,
      { location: "/workspaces/acme:mail", connector: "send" },
      { location: "/workspaces/acme/mail", connector: "send" },
      { location: "/workspaces/acme", connector: "mail/send" },
      { location: "/workspaces/acme\u0000mail", connector: "send" },
      { location: "/workspaces/acme", connector: "mail\u0000send" },
    ];
    await store.save(connectionSettings(first.location, first.connector));
    for (const other of joined.slice(1)) {
      expect(await store.get(other), JSON.stringify(other)).toBeNull();
    }
    for (const key of joined) await store.save(connectionSettings(key.location, key.connector));
    for (const key of joined) {
      expect(await store.get(key), JSON.stringify(key)).toEqual(
        connectionSettings(key.location, key.connector),
      );
    }
  });
}

function damageCases(make: MakeConnectionSettingsStore): void {
  it("throws, naming the key, when settings can't be read", async () => {
    const { store, damage } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    await store.save(connectionSettings("/workspaces/zeta"));
    await damage(acme);

    // Never null: that would read as "sending off" without telling the user why,
    // and a store that hid the damage could also hide a swapped-in record.
    const error = await store.get(acme).then(
      () => expect.fail("get gave settings that can't be read"),
      (caught: unknown) => caught,
    );
    const text = errorText(error);
    expect(text).toContain("/workspaces/acme");
    expect(text).toContain("mail");
    expect(await store.get({ location: "/workspaces/zeta", connector: "mail" })).toEqual(
      connectionSettings("/workspaces/zeta"),
    );
  });

  it("keeps the contents of settings that can't be read out of the error", async () => {
    const { store, damage } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    await damage(acme);
    const error = await store.get(acme).then(
      () => expect.fail("get gave settings that can't be read"),
      (caught: unknown) => caught,
    );
    // The message and every cause: a parser's error can quote the text it read.
    const text = errorText(error);
    expect(text).not.toContain("2026-11-09T10:00:00.000Z");
    expect(text).not.toContain("allowSending");
  });

  it("removes settings that can't be read, so the user can recover", async () => {
    const { store, damage } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    await damage(acme);
    await store.remove(acme);
    expect(await store.get(acme)).toBeNull();
  });

  it("replaces settings that can't be read when they are saved again", async () => {
    const { store, damage } = await make();
    await store.save(connectionSettings("/workspaces/acme"));
    await damage(acme);
    await store.save(connectionSettings("/workspaces/acme", "mail", false));
    expect(await store.get(acme)).toEqual(connectionSettings("/workspaces/acme", "mail", false));
  });
}

/** The message of an error and of each of its causes, one per line. */
function errorText(error: unknown): string {
  const lines: string[] = [];
  let current = error;
  for (let depth = 0; current !== undefined && depth < 10; depth++) {
    if (!(current instanceof Error)) {
      lines.push(String(current));
      break;
    }
    lines.push(current.message);
    current = current.cause;
  }
  return lines.join("\n");
}
