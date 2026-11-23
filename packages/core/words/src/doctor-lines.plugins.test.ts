import type { DoctorPluginProblem, PluginsLine } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DoctorFace, type DoctorLineItem, doctorLineWords } from "./doctor-lines.ts";
import { plainText } from "./phrase.ts";

const face: DoctorFace = {
  trustCommand: "halonic trust",
  validateCommand: "halonic validate",
  signInShell: "sh",
  shellWord: (text) => (/^[\w./:-]+$/u.test(text) ? text : `'${text}'`),
};

/** Each item as text, a fix marked, so a test sees which is which. */
function itemText(item: DoctorLineItem): string {
  if ("docs" in item) return `docs: ${item.docs}`;
  return "fix" in item ? `fix: ${plainText(item.fix)}` : plainText(item.sentence);
}

function worded(...problems: DoctorPluginProblem[]): { label: string; items: string[] } {
  const line: PluginsLine = { check: "plugins", status: "failed", problems };
  const words = doctorLineWords(line, face);
  return { label: plainText(words.label.phrase), items: words.items.map(itemText) };
}

/** A plugin record file, as the CLI finds it in the profile. */
const file = "/profile/plugin-records/1f0e.jsonl";

verifies("words.doctor-plugins", () => {
  it("names a connector's plugin that isn't added, with the near id and a fix, or the fix", () => {
    expect(
      worded({
        problem: "not-added",
        connector: "orders",
        plugin: "acme-order",
        near: "acme-orders",
      }),
    ).toEqual({
      label: "Plugins",
      items: [
        "orders uses the plugin acme-order, which isn't added, so orders has no tools yet.",
        "Did you mean acme-orders?",
        "fix: Fix: change the plugin id in orders.connector.yaml to acme-orders, or add acme-order with halonic plugin add <folder or git address>, then run halonic doctor again.",
      ],
    });
    expect(
      worded({ problem: "not-added", connector: "orders", plugin: "tides", near: undefined }).items,
    ).toEqual([
      "orders uses the plugin tides, which isn't added, so orders has no tools yet.",
      "fix: Fix: add it with halonic plugin add <folder or git address>, then run halonic doctor again.",
    ]);
  });

  it("says why a plugin is off, with the command that trusts it, and how to fix one that can't be read", () => {
    expect(
      worded(
        { problem: "off", plugin: "acme-orders", why: "changed" },
        { problem: "off", plugin: "tides", why: "not-trusted" },
        { problem: "broken", plugin: "maps" },
      ).items,
    ).toEqual([
      "acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders",
      "tides is off: not trusted yet · halonic trust --plugin tides",
      "maps can't be read or checked, so it's off.",
      "fix: Fix: remove it with halonic plugin remove maps, then add a version that works.",
    ]);
  });

  it("makes ids printable, and quotes the plugin in the command for the person's shell", () => {
    const [sentence] = worded({
      problem: "off",
      plugin: "my plugin\u001b[31m",
      why: "changed",
    }).items;
    // The id is shown printable; the command's word is the face's to make safe, as it is the CLI's.
    expect(sentence).toMatch(/^my plugin\\u001b\[31m is off: /u);
    expect(sentence).toContain("halonic trust --plugin 'my plugin");
    const [, fix] = worded({ problem: "broken", plugin: "my plugin" }).items;
    expect(fix).toContain("halonic plugin remove 'my plugin'");
  });

  it("names a plugin record file or folder that can't be read by you, with the fix plugin list gives", () => {
    expect(
      worded(
        { problem: "records-unreadable", place: "file", path: file, access: "yours" },
        {
          problem: "records-unreadable",
          place: "folder",
          path: "/profile/plugin-records",
          access: "another-user",
        },
        { problem: "records-unreadable", place: "file", path: file, access: "windows" },
      ).items,
    ).toEqual([
      `The plugin record file ${file} can't be read by you.`,
      `fix: Fix: run chmod 600 ${file}, then run halonic doctor again.`,
      "The plugin records folder /profile/plugin-records can't be read by you.",
      `fix: Fix: it belongs to another user, so run sudo chown "$(id -un)" /profile/plugin-records, then chmod 700 /profile/plugin-records, then run halonic doctor again.`,
      `The plugin record file ${file} can't be read by you.`,
      "fix: Fix: give your user account access to it in the file's Properties, under Security, then run halonic doctor again.",
    ]);
  });

  it("names a damaged plugin record file with its line, and says what deleting it forgets", () => {
    expect(
      worded(
        { problem: "records-damaged", file, line: 2, why: "it is not JSON.", holds: "sources" },
        {
          problem: "records-damaged",
          file,
          line: undefined,
          why: "it is cut off.",
          holds: "settings",
        },
      ).items,
    ).toEqual([
      `The plugin record file ${file} is damaged at line 2: it is not JSON.`,
      "fix: Fix: delete line 2 from it, or delete the file, then run halonic doctor again. Deleting the file forgets where each plugin was added from; the plugins stay.",
      `The plugin record file ${file} is damaged: it is cut off.`,
      "fix: Fix: delete the file, then run halonic doctor again. Deleting the file sets every plugin's settings back to their defaults; the plugins stay.",
    ]);
  });
});
