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

verifies("words.doctor-plugins", () => {
  it("names a connector's plugin that isn't added, with the near id or the fix under it", () => {
    expect(
      worded({
        problem: "not-added",
        connector: "orders",
        plugin: "acme-order",
        near: "acme-orders",
      }),
    ).toEqual({
      label: "Plugins",
      items: ["orders uses the plugin acme-order, which isn't added.", "Did you mean acme-orders?"],
    });
    expect(
      worded({ problem: "not-added", connector: "orders", plugin: "tides", near: undefined }).items,
    ).toEqual([
      "orders uses the plugin tides, which isn't added.",
      "fix: Fix: add it with halonic plugin add <folder or git address>, then run halonic doctor again.",
    ]);
  });

  it("says why a plugin is off, with the command that trusts it, and one that can't be read", () => {
    expect(
      worded(
        { problem: "off", plugin: "acme-orders", why: "changed" },
        { problem: "off", plugin: "tides", why: "not-trusted" },
        { problem: "broken", plugin: "maps" },
      ).items,
    ).toEqual([
      "acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders",
      "tides is off: not trusted yet · halonic trust --plugin tides",
      "maps can't be read or checked, so it's off. See halonic plugin list.",
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
  });
});
