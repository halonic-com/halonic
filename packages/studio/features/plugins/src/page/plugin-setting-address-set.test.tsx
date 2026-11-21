// @vitest-environment jsdom

import { type Plugin, type PluginSettingValue, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ReviewPluginDialog } from "./review-plugin-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function plugin(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

const homeStation = plugin(`id: weather
version: 1.2.0
sdk: 1
name: Weather
ui:
  settings:
    station: { type: url, label: Station address }
backend:
  hosts: [api.example.com, { fromSetting: station, class: private }]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: false }`);

const notEntered =
  "The address you enter in Weather's settings, under Station address · only on your home network";

/** Opens Review with the plugin's saved settings, as `settings` answers them. */
async function review(settings: (manifest: Plugin) => Promise<Record<string, PluginSettingValue>>) {
  render(
    <ReviewPluginDialog
      plugin={weather("not-trusted")}
      manifest={homeStation}
      trust={async () => {}}
      settings={{ settings }}
      onClose={() => {}}
    />,
  );
  await act(async () => {});
}

function rows(): (string | null)[] {
  return [...(document.querySelector("dialog")?.querySelectorAll("li") ?? [])].map(
    (row) => row.textContent,
  );
}

verifies("plugins.plugin-trust-setting-address-set", () => {
  it("shows a host from a setting that's set as its value, and where it comes from", async () => {
    const asked: string[] = [];
    await review(async (manifest) => {
      asked.push(manifest.id);
      return { station: "192.168.1.20" };
    });

    expect(asked).toEqual(["weather"]);
    expect(rows()).toContain(
      "192.168.1.20 (from Weather's settings: Station address · only on your home network)",
    );
    expect(rows()).not.toContain(notEntered);
    expect(document.querySelector("dialog")?.textContent).toContain("Reaches 2 addresses.");
  });

  it("keeps the row for a setting not yet entered while it's empty", async () => {
    await review(async () => ({ station: "  " }));

    expect(rows()).toContain(notEntered);
  });

  it("keeps the row for a setting not yet entered when the settings can't be read", async () => {
    await review(async () => {
      throw new Error("acme settings unreadable");
    });

    expect(rows()).toContain(notEntered);
  });
});

verifies("plugins.plugin-trust-row-marks", () => {
  it("shows a set value in the text colour and only where it comes from in the muted colour", async () => {
    await review(async () => ({ station: "192.168.1.20" }));

    const value = [...(document.querySelector("dialog")?.querySelectorAll("code") ?? [])].find(
      (code) => code.textContent === "192.168.1.20",
    );
    expect(value?.className).toContain("text-fg");
    expect(value?.className).not.toContain("text-fg-muted");
    expect(value?.nextElementSibling?.className).toContain("text-fg-muted");
  });
});
