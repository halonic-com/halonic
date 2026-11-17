import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginTrustContent } from "./plugin-trust-content.ts";
import {
  pluginTrustFiles,
  pluginTrustSectionHeadings,
  pluginTrustSectionOrder,
  pluginTrustSections,
} from "./plugin-trust-sections.ts";
import { pluginFrom, weatherFiles } from "./testing/plugin-fixtures.ts";

/** A plugin with one backend tool that reads, and nothing else. */
const onlyATool = `id: clock
version: 1.0.0
sdk: 1
name: Clock
description: The time.
backend:
  hosts: []
  tools:
    - { name: now, description: The time now., risk: read, untrusted: false }
`;

const sectionsOf = (manifest?: string) =>
  pluginTrustSections(pluginTrustContent({ plugin: pluginFrom(manifest), files: weatherFiles }));

verifies("app.plugin-trust-sections", () => {
  it("gives every section of a plugin that has something in each, in risk order", () => {
    expect(sectionsOf()).toEqual(["tools", "programs", "secrets", "addresses", "in-studio"]);
  });

  it("leaves out the sections that have nothing in them", () => {
    expect(sectionsOf(onlyATool)).toEqual(["tools"]);
  });

  it("has the design's headings, in the design's order", () => {
    expect(pluginTrustSectionOrder.map((section) => pluginTrustSectionHeadings[section])).toEqual([
      "Tools for agents",
      "Programs",
      "Secrets",
      "Addresses",
      "In Studio",
    ]);
  });

  it("lists the files other than the manifest, with none more", () => {
    const content = pluginTrustContent({ plugin: pluginFrom(), files: weatherFiles });
    expect(pluginTrustFiles(content)).toEqual({ shown: ["backend/index.js"], more: 0 });
  });

  it("lists the first ten files by path and counts the rest", () => {
    const content = pluginTrustContent({ plugin: pluginFrom(), files: filesNamed(13) });
    expect(pluginTrustFiles(content)).toEqual({
      shown: Array.from({ length: 10 }, (_, index) => pathNumber(index)),
      more: 3,
    });
  });

  it("lists eleven files in full, because \"and 1 more\" would take the same row", () => {
    const content = pluginTrustContent({ plugin: pluginFrom(), files: filesNamed(11) });
    expect(pluginTrustFiles(content)).toMatchObject({ more: 0 });
    expect(pluginTrustFiles(content).shown).toHaveLength(11);
  });

  it("collapses from twelve files, so the count is at least two", () => {
    const content = pluginTrustContent({ plugin: pluginFrom(), files: filesNamed(12) });
    expect(pluginTrustFiles(content)).toMatchObject({ more: 2 });
    expect(pluginTrustFiles(content).shown).toHaveLength(10);
  });

  it("lists exactly ten files without a count of more", () => {
    const content = pluginTrustContent({ plugin: pluginFrom(), files: filesNamed(10) });
    expect(pluginTrustFiles(content)).toMatchObject({ more: 0 });
    expect(pluginTrustFiles(content).shown).toHaveLength(10);
  });
});

const pathNumber = (index: number) => `backend/file-${String(index).padStart(2, "0")}.js`;

/** `plugin.yaml` and `count` other files, so the manifest is never one of those listed. */
const filesNamed = (count: number) => [
  weatherFiles[0] as (typeof weatherFiles)[number],
  ...Array.from({ length: count }, (_, index) => ({
    path: pathNumber(index),
    sha256: "c".repeat(64),
  })),
];
