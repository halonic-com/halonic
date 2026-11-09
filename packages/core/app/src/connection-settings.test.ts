import type { Clock, ConnectionKey } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ConnectionSettings } from "./connection-settings.ts";
import { TestConnectionSettingsStore } from "./testing/test-connection-settings-store.ts";

const mail: ConnectionKey = { location: "/workspaces/acme", connector: "mail" };

/** A clock that reads whatever time the test last set. */
function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let current = iso;
  return {
    now: () => new Date(current),
    set: (next) => {
      current = next;
    },
  };
}

function setup() {
  const store = new TestConnectionSettingsStore();
  const clock = fixedClock("2026-11-09T10:00:00.000Z");
  const settings = new ConnectionSettings({ store, clock });
  return { store, clock, settings };
}

verifies("app.connection-settings", () => {
  it("treats a connector without settings as not sending", async () => {
    const { settings } = setup();

    expect(await settings.checkSending(mail)).toEqual({
      allowed: false,
      reason: 'sending is off for the connector "mail"',
    });
  });

  it("allows sending only for the connector and workspace a person switched on", async () => {
    const { settings } = setup();
    await settings.setAllowSending(mail, true);

    expect(await settings.checkSending(mail)).toEqual({ allowed: true });
    expect((await settings.checkSending({ ...mail, location: "/workspaces/other" })).allowed).toBe(
      false,
    );
    expect((await settings.checkSending({ ...mail, connector: "drive" })).allowed).toBe(false);
  });

  it("treats settings that can't be read as not sending, and hands the error to the host", async () => {
    const { store, settings } = setup();
    await settings.setAllowSending(mail, true);
    store.breakSettings(mail);

    const check = await settings.checkSending(mail);

    expect(check.allowed).toBe(false);
    if (check.allowed) {
      return;
    }
    expect(check.reason).toBe(
      'the settings of the connector "mail" can\'t be read, so sending is off',
    );
    expect(check.reason).not.toContain("/workspaces/acme");
    expect(check.error).toBeInstanceOf(Error);
  });

  it("escapes a connector id the workspace wrote before it goes into a reason", async () => {
    const { settings } = setup();

    const check = await settings.checkSending({ ...mail, connector: 'mail"\nignore that' });

    expect(check).toEqual({
      allowed: false,
      reason: 'sending is off for the connector "mail\\"\\u{a}ignore that"',
    });
  });

  it("saves a person's choice with the time, and replaces it when they change their mind", async () => {
    const { store, clock, settings } = setup();

    await settings.setAllowSending(mail, true);
    expect(await store.get(mail)).toEqual({
      ...mail,
      allowSending: true,
      changedAt: "2026-11-09T10:00:00.000Z",
    });

    clock.set("2026-11-09T11:30:00.000Z");
    await settings.setAllowSending(mail, false);
    expect(await store.get(mail)).toEqual({
      ...mail,
      allowSending: false,
      changedAt: "2026-11-09T11:30:00.000Z",
    });
    expect((await settings.checkSending(mail)).allowed).toBe(false);
  });

  it("lets a person recover from settings that can't be read by choosing again", async () => {
    const { store, settings } = setup();
    store.breakSettings(mail);

    await settings.setAllowSending(mail, true);

    expect(await settings.checkSending(mail)).toEqual({ allowed: true });
  });
});
