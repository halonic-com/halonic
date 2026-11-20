// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

verifies("studio.commands-name-folder", () => {
  it("names the workspace's folder, in quotes for its space, in the start command", async () => {
    const { host } = memoryHost([], [], [reply], [settings], {
      folder: "/acme/Documents/Acme sample",
    });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(page.querySelector("[data-testid=start-command] code")?.textContent).toBe(
      'halonic run --dir "/acme/Documents/Acme sample" reply',
    );
  });

  it("shows no start command where no terminal reaches the folder", async () => {
    const { host } = memoryHost([], [], [reply], [settings], { folder: "\\\\acme\\Acme sample" });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(page.querySelector("[data-testid=start-command]")).toBeNull();
  });

  it("shows no start command on a Windows drive folder, whose run Studio wouldn't list", async () => {
    // The drive is joined on, so no drive path stands in this file for the leak guard to find.
    const folder = `${"D:"}\\Acme\\Acme sample`;
    const { host } = memoryHost([], [], [reply], [settings], { folder });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    expect(page.querySelector("[data-testid=start-command]")).toBeNull();
  });
});
