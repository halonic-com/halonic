// @vitest-environment jsdom

import { pluginTrustChanges, pluginTrustContent } from "@halonicjs/app";
import { type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ReviewPluginDialog } from "../page/review-plugin-dialog.tsx";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { changeSummary } from "./change-rows.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function manifestOf(yaml: string): Plugin {
  const parsed = parseFile("plugin", yaml);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

const head =
  "id: weather\nversion: 1.2.0\nsdk: 1\nname: Weather\nbackend:\n  hosts: [api.example.com]\n  tools:\n";
const forecast =
  "    - { name: forecast, description: The forecast., risk: read, untrusted: true }\n";
const trusted = manifestOf(head + forecast);
const current = manifestOf(
  `${head}${forecast}    - { name: set_alert, description: Sets an alert., risk: write, untrusted: false }\n`,
);
const escalated = manifestOf(
  `${head}    - { name: forecast, description: The forecast., risk: write, untrusted: true }\n`,
);

function changesFrom(before: Plugin, after: Plugin) {
  const files = [{ path: "plugin.yaml", sha256: "a" }];
  return pluginTrustChanges(
    pluginTrustContent({ plugin: before, files }),
    pluginTrustContent({ plugin: after, files: [{ path: "plugin.yaml", sha256: "b" }] }),
  );
}

function open(
  manifest: Plugin,
  changes: unknown,
  trust: (id: string) => Promise<void> = async () => {},
) {
  const plugin = {
    ...weather("changed"),
    manifest,
    trustedAt: "2026-11-03T09:00:00Z",
    changes,
  } as never;
  let closed = 0;
  render(
    <ReviewPluginDialog
      plugin={plugin}
      manifest={manifest}
      trust={trust}
      onClose={() => closed++}
    />,
  );
  return { closed: () => closed };
}

const dialogText = () => document.querySelector("dialog")?.textContent ?? "";
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));

verifies("plugins.plugin-changes", () => {
  it("lists a new tool that changes things, and what stayed", () => {
    open(current, changesFrom(trusted, current));
    expect(document.querySelector("h2, [role=dialog] h1, dialog h2")?.textContent).toMatch(
      /^Weather changed since you trusted it on 3 Nov/,
    );
    const text = dialogText();
    expect(text).toContain("New");
    expect(text).toContain("Tool set_alert");
    expect(text).toContain("Changes things");
    expect(text).toContain("Unchanged (");
    expect(text).toContain("Tool forecast");
  });

  it("shows the old value, an arrow and the new value for a changed tool", () => {
    const summary = changeSummary(escalated, changesFrom(trusted, escalated));
    expect(summary.rows).toContainEqual({
      tag: "Changed",
      what: "Tool forecast",
      from: "Reads, outside text",
      to: "Changes things, outside text",
    });
    open(escalated, changesFrom(trusted, escalated));
    expect(dialogText()).toContain("Reads, outside text → Changes things, outside text");
  });

  it("has Not now focused and Trust again and turn on trusts the plugin", async () => {
    const asked: string[] = [];
    const view = open(current, changesFrom(trusted, current), async (id) => void asked.push(id));
    expect(document.activeElement).toBe(button("Not now"));
    await act(async () => button("Trust again and turn on")?.click());
    expect(asked).toEqual(["weather"]);
    expect(view.closed()).toBe(1);
  });

  it("names the field when a secret's only change is how it is sent", () => {
    const secret = (placement: string) =>
      manifestOf(
        `${head}${forecast}  secrets: { token: { purpose: Signs in., hosts: [api.example.com], ${placement} } }\n`,
      );
    const summary = changeSummary(
      secret("as: header, header: x-api-key"),
      changesFrom(secret("as: bearer"), secret("as: header, header: x-api-key")),
    );
    expect(summary.rows).toContainEqual({
      tag: "Changed",
      what: "Secret token",
      to: "how it is sent changed",
    });
  });

  it("keeps the manifest backend row when only the backend entry changed", () => {
    const entry = (file: string) =>
      manifestOf(`${head.replace("backend:\n", `backend:\n  entry: ${file}\n`)}${forecast}`);
    const summary = changeSummary(entry("b.js"), changesFrom(entry("a.js"), entry("b.js")));
    expect(summary.rows.map((row) => row.what)).toContain("Manifest backend");
  });

  it("only says something changed when the record can't be compared", () => {
    open(current, { readable: false });
    expect(dialogText()).toContain("Something in this plugin changed. Halonic can't say what.");
  });
});
