// @vitest-environment jsdom

import { type Plugin, type PluginSettingValue, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginSettingProblem } from "./plugin-secrets.ts";
import {
  type PluginSecretStore,
  type PluginSettingsReader,
  PluginSettingsSection,
  type SettingsSaveState,
  secretHosts,
} from "./plugin-settings-section.tsx";

afterEach(unmountAll);

const weather = pluginFrom(`id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  secrets:
    weather-key:
      purpose: The forecast service's API key
      hosts: [api.example.com]
      as: header
      header: x-api-key
  tools:
    - { name: forecast, description: The forecast for one place., risk: read, untrusted: true }
ui:
  settings:
    city: { label: City, type: text, required: true }
    units: { label: Units, type: choice, choices: [metric, imperial], default: metric }
    days: { label: Days, type: number, help: "<b>How far</b> ahead" }
    alerts: { label: Alerts, type: boolean, default: false }
    key: { label: API key, type: secret, secret: weather-key }
`);

function pluginFrom(manifest: string): Plugin {
  const parsed = parseFile("plugin", manifest);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

interface FakeOptions {
  readonly values?: Record<string, PluginSettingValue>;
  readonly problems?: readonly PluginSettingProblem[];
  /** Refuses only the records this finds problems in. */
  readonly check?: (values: Record<string, unknown>) => readonly PluginSettingProblem[];
  /** Each save waits until the test calls `release`. */
  readonly held?: boolean;
  readonly hostFails?: boolean;
  readonly stored?: Record<string, string>;
  readonly locked?: boolean;
  readonly unreadable?: boolean;
}

/** A host like `PluginService` and a keychain like `TauriSecrets`, in memory. */
function fakes(options: FakeOptions = {}) {
  const saved: Record<string, unknown>[] = [];
  const keychain = new Map(Object.entries(options.stored ?? {}));
  const waiting: (() => void)[] = [];
  const release = async () => {
    waiting.shift()?.();
    await settle();
  };
  const host: PluginSettingsReader = {
    settings: async () => {
      if (options.unreadable === true) throw new Error("The profile can't be read.");
      return { city: "Oslo", units: "metric", alerts: false, ...options.values };
    },
    saveSettings: async (_plugin, values) => {
      if (options.held === true) await new Promise<void>((resolve) => waiting.push(resolve));
      if (options.hostFails === true) throw new Error("The disk is full.");
      if (options.problems !== undefined) return { ok: false, error: options.problems };
      const problems = options.check?.(values) ?? [];
      if (problems.length > 0) return { ok: false, error: problems };
      saved.push({ ...values });
      return { ok: true };
    },
    secretNames: () => ({ "weather-key": "plugin__weather__weather-key" }),
    forget: async () => {},
  };
  const secrets: PluginSecretStore = {
    get: async (name) => keychain.get(name) ?? null,
    set: async (name, value) => {
      if (options.locked === true) throw new Error("The keychain is locked.");
      keychain.set(name, value);
    },
    remove: async (name) => {
      keychain.delete(name);
    },
  };
  return { host, secrets, saved, keychain, release };
}

async function show(options: FakeOptions = {}, off?: { reason: string }) {
  const parts = fakes(options);
  const states: SettingsSaveState[] = [];
  const view = render(
    <PluginSettingsSection
      plugin={weather}
      host={parts.host}
      secrets={parts.secrets}
      off={off}
      onSaveState={(state) => states.push(state)}
    />,
  );
  await settle();
  return { ...parts, view, states };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function fieldNamed(view: HTMLElement, label: string): HTMLInputElement {
  const labelElement = [...view.querySelectorAll("label")].find(
    (l) => l.textContent?.replace(/Required$/u, "").trim() === label,
  );
  const id = labelElement?.getAttribute("for");
  const input = id === null || id === undefined ? null : view.ownerDocument.getElementById(id);
  if (!(input instanceof HTMLInputElement)) throw new Error(`No field called ${label}`);
  return input;
}

async function typeAndLeave(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    input.focus();
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await settle();
}

function lineUnder(input: HTMLInputElement): string {
  const id = input.getAttribute("aria-describedby");
  return id === null ? "" : (input.ownerDocument.getElementById(id)?.textContent ?? "");
}

verifies("plugins.plugin-settings", () => {
  describe("PluginSettingsSection", () => {
    it("shows each setting with its label, and a secret as Not set with where it goes", async () => {
      const { view } = await show();
      expect(view.querySelector("h2")?.textContent).toBe("Settings");
      expect(fieldNamed(view, "City").value).toBe("Oslo");
      const key = fieldNamed(view, "API key");
      expect(key.type).toBe("password");
      expect(key.value).toBe("");
      expect(lineUnder(key)).toBe(
        "Not set Stored in your secrets as weather-key. Sent only to api.example.com.",
      );
    });

    it("says Set for a stored secret, and never puts its value on screen", async () => {
      const { view } = await show({ stored: { "plugin__weather__weather-key": "s3cret-value" } });
      expect(lineUnder(fieldNamed(view, "API key"))).toMatch(/^Set /u);
      expect(view.innerHTML).not.toContain("s3cret-value");
    });

    it("shows the plugin's help as plain text", async () => {
      const { view } = await show();
      expect(lineUnder(fieldNamed(view, "Days"))).toBe("<b>How far</b> ahead");
      expect(view.querySelector("b")).toBeNull();
    });

    it("saves a text setting with the others when you leave it", async () => {
      const { view, saved, states } = await show();
      await typeAndLeave(fieldNamed(view, "City"), "Bergen");
      expect(saved).toEqual([{ city: "Bergen", units: "metric", alerts: false }]);
      expect(states).toEqual(["saving", "saved"]);
    });

    it("saves nothing when you leave a field you didn't change", async () => {
      const { view, saved } = await show();
      await typeAndLeave(fieldNamed(view, "City"), "Oslo");
      expect(saved).toEqual([]);
    });

    it("saves a number setting as a number", async () => {
      const { view, saved } = await show();
      await typeAndLeave(fieldNamed(view, "Days"), "3");
      expect(saved[0]).toMatchObject({ days: 3 });
    });

    it("saves a switch at once", async () => {
      const { view, saved } = await show();
      const alerts = view.querySelector<HTMLInputElement>('[role="switch"]');
      act(() => alerts?.click());
      await settle();
      expect(saved[0]).toMatchObject({ alerts: true });
    });

    it("runs quick saves one after the other, so the last keeps both values", async () => {
      const { view, saved, release } = await show({ held: true });
      await typeAndLeave(fieldNamed(view, "City"), "Bergen");
      const alerts = view.querySelector<HTMLInputElement>('[role="switch"]');
      act(() => alerts?.click());
      await settle();
      await release();
      await release();
      expect(saved).toEqual([
        { city: "Bergen", units: "metric", alerts: false },
        { city: "Bergen", units: "metric", alerts: true },
      ]);
    });

    it("saves a switch flipped back while its first save is still going", async () => {
      const { view, saved, release } = await show({ held: true });
      const alerts = view.querySelector<HTMLInputElement>('[role="switch"]');
      act(() => alerts?.click());
      await settle();
      act(() => alerts?.click());
      await settle();
      await release();
      await release();
      expect(alerts?.checked).toBe(false);
      expect(saved.at(-1)).toMatchObject({ alerts: false });
    });

    it("keeps another field's error when a later save succeeds", async () => {
      const check = (values: Record<string, unknown>) =>
        values["city"] === undefined ? [{ setting: "city", message: "fill this in" }] : [];
      const { view, saved } = await show({ check });
      const city = fieldNamed(view, "City");
      await typeAndLeave(city, "");
      const alerts = view.querySelector<HTMLInputElement>('[role="switch"]');
      act(() => alerts?.click());
      await settle();
      expect(saved).toEqual([{ city: "Oslo", units: "metric", alerts: true }]);
      expect(lineUnder(city)).toBe("Fill this in.");
      expect(city.value).toBe("");
    });

    it("saves a secret under the plugin's own name, then empties the field and says Set", async () => {
      const { view, keychain, saved } = await show();
      const key = fieldNamed(view, "API key");
      await typeAndLeave(key, "abc");
      expect([...keychain]).toEqual([["plugin__weather__weather-key", "abc"]]);
      expect(saved).toEqual([{ city: "Oslo", units: "metric", alerts: false }]);
      expect(key.value).toBe("");
      expect(lineUnder(key)).toMatch(/^Set /u);
    });

    it("says why a value doesn't fit, under its field, and keeps what was typed", async () => {
      const problems = [{ setting: "city", message: "fill this in" }];
      const { view, states } = await show({ problems });
      const city = fieldNamed(view, "City");
      await typeAndLeave(city, "");
      expect(lineUnder(city)).toBe("Fill this in.");
      expect(city.getAttribute("aria-invalid")).toBe("true");
      expect(states).toEqual(["saving", "failed"]);
    });

    it("says the secret wasn't saved and keeps the typed one when the keychain fails", async () => {
      const { view } = await show({ locked: true });
      const key = fieldNamed(view, "API key");
      await typeAndLeave(key, "abc");
      expect(lineUnder(key)).toBe("Couldn't save the secret. The keychain is locked.");
      expect(key.value).toBe("abc");
    });

    it("says the old secret is still in use when one was stored", async () => {
      const { view } = await show({
        locked: true,
        stored: { "plugin__weather__weather-key": "old" },
      });
      const key = fieldNamed(view, "API key");
      await typeAndLeave(key, "abc");
      expect(lineUnder(key)).toBe(
        "Couldn't save the secret. The keychain is locked. The one you saved before is still in use.",
      );
    });

    it("names the setting when the host can't save, and puts a switch back", async () => {
      const { view } = await show({ hostFails: true });
      const alerts = view.querySelector<HTMLInputElement>('[role="switch"]');
      act(() => alerts?.click());
      await settle();
      expect(alerts?.checked).toBe(false);
      expect(view.textContent).toContain("Couldn't save Alerts. The disk is full.");
    });

    it("keeps the settings readable but saves nothing while the plugin is off", async () => {
      const { view, saved, keychain } = await show({}, { reason: "status" });
      const city = fieldNamed(view, "City");
      expect(city.readOnly).toBe(true);
      expect(city.getAttribute("aria-disabled")).toBe("true");
      await typeAndLeave(city, "Bergen");
      await typeAndLeave(fieldNamed(view, "API key"), "abc");
      expect(saved).toEqual([]);
      expect(keychain.size).toBe(0);
    });

    it("says it couldn't load the settings, with the reason and Try again", async () => {
      const { view } = await show({ unreadable: true });
      expect(view.querySelector("h2")?.textContent).toBe("Couldn't load the settings");
      expect(view.textContent).toContain("The profile can't be read.");
      expect(view.querySelector("button")?.textContent).toBe("Try again");
      expect(view.querySelector("input")).toBeNull();
    });

    it("shows nothing for a plugin without settings", async () => {
      const bare = { ...weather, ui: { settings: {}, commands: [], cards: [] } };
      const { host, secrets } = fakes();
      const view = render(<PluginSettingsSection plugin={bare} host={host} secrets={secrets} />);
      await settle();
      expect(view.innerHTML).toBe("");
    });
  });

  describe("secretHosts", () => {
    it("joins the hosts a secret goes to, and names a host taken from a setting", () => {
      const plugin = pluginFrom(`id: station
version: 1.0.0
sdk: 1
name: Station
backend:
  hosts: [api.example.com, { fromSetting: address, class: loopback }]
  secrets:
    station-key:
      purpose: Signs in
      hosts: [api.example.com, { fromSetting: address }]
      as: bearer
  tools:
    - { name: read, description: Reads., risk: read, untrusted: true }
ui:
  settings:
    address: { label: Station address, type: url }
    key: { label: Key, type: secret, secret: station-key }
`);
      expect(secretHosts(plugin, "station-key")).toBe(
        "api.example.com and the address you enter under Station address",
      );
    });
  });
});
