import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginTrustContent } from "./plugin-trust-content.ts";
import {
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
});
