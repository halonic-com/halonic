// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

verifies("workflows.page.frame-and-states", () => {
  it("opens on Configuration's Tests when asked, and General when you come back to it", async () => {
    const { host } = memoryHost([], [], [reply], [settings]);
    const page = await show(
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        startOnTests
      />,
    );
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
        one.textContent?.startsWith(name),
      );
    expect(tab("Configuration")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-tests]")).not.toBeNull();
    await act(async () => tab("Flow")?.click());
    await act(async () => tab("Configuration")?.click());
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-general]")).not.toBeNull();
  });

  it("goes to Configuration's Tests when an open page is asked for them", async () => {
    const { host } = memoryHost([], [], [reply], [settings]);
    let ask: () => void = () => undefined;
    function Asked() {
      const [asked, setAsked] = useState(false);
      ask = () => setAsked(true);
      return (
        <WorkflowScreen
          host={host}
          runs={memoryRuns().source}
          hubId="acme"
          id="reply"
          startOnTests={asked}
        />
      );
    }
    const page = await show(<Asked />);
    const selected = () => page.querySelector("[role=tab][aria-selected=true]")?.textContent;
    expect(selected()?.startsWith("Flow")).toBe(true);
    await act(async () => ask());
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-tests]")).not.toBeNull();
  });

  it("goes to Tests when asked from Configuration's General", async () => {
    const { host } = memoryHost([], [], [reply], [settings]);
    let ask: () => void = () => undefined;
    function Asked() {
      const [asked, setAsked] = useState(false);
      ask = () => setAsked(true);
      return (
        <WorkflowScreen
          host={host}
          runs={memoryRuns().source}
          hubId="acme"
          id="reply"
          startOnTests={asked}
        />
      );
    }
    const page = await show(<Asked />);
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
        one.textContent?.startsWith(name),
      );
    await act(async () => tab("Configuration")?.click());
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-general]")).not.toBeNull();
    await act(async () => ask());
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-tests]")).not.toBeNull();
  });

  it("goes to Tests again when asked a second time after the person went back to Flow", async () => {
    const { host } = memoryHost([], [], [reply], [settings]);
    let ask: () => void = () => undefined;
    function Asked() {
      const [asked, setAsked] = useState(1);
      ask = () => setAsked((count) => count + 1);
      return (
        <WorkflowScreen
          host={host}
          runs={memoryRuns().source}
          hubId="acme"
          id="reply"
          startOnTests
          testsAsked={asked}
        />
      );
    }
    const page = await show(<Asked />);
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((one) =>
        one.textContent?.startsWith(name),
      );
    await act(async () => tab("Flow")?.click());
    expect(tab("Flow")?.getAttribute("aria-selected")).toBe("true");
    await act(async () => ask());
    expect(page.querySelector("[role=tab][aria-selected=true][id$=-tests]")).not.toBeNull();
  });
});
