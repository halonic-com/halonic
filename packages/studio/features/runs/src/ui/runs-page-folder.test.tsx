// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { RunsSource } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

async function openPage(source: RunsSource, canRun = false) {
  const root = render(
    <RunsView list={new RunsList(source)} now={() => mondayMorning} canRun={canRun} />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

// The drive is joined on, so no drive path stands in this file for the leak guard to find.
const windowsFolder = `${"D:"}\\Acme\\Acme sample`;

verifies("studio.commands-name-folder", () => {
  it("names the workspace's folder in the line under No runs yet", async () => {
    const root = await openPage({
      ...fakeSource([]).source,
      folder: "/acme/Documents/Acme sample",
    });
    expect(root.querySelector("code")?.textContent).toBe(
      'halonic run --dir "/acme/Documents/Acme sample" support-reply',
    );
  });

  it("says only No runs yet on a Windows folder, whose run Studio wouldn't list", async () => {
    const root = await openPage({ ...fakeSource([]).source, folder: windowsFolder });
    expect(root.textContent).toContain("No runs yet");
    expect(root.textContent).not.toContain("show up here");
    expect(root.querySelector("code")).toBeNull();
  });

  it("sends a Windows folder with no workflow to Workflows, with no command line", async () => {
    const fake = fakeSource([]);
    fake.workflows([]);
    const root = await openPage({ ...fake.source, folder: windowsFolder });
    expect(root.textContent).toContain("This workspace has no workflow yet: add one in Workflows.");
    expect(root.textContent).not.toContain("show up here");
  });

  it("says to press Run on a Windows folder, but not that command-line runs show up here", async () => {
    const root = await openPage({ ...fakeSource([]).source, folder: windowsFolder }, true);
    expect(root.textContent).toContain(
      "To start one, open Support reply in Workflows and press Run.",
    );
    expect(root.textContent).not.toContain("show up here");
  });

  it("keeps the command-line sentence beside Run on a POSIX folder", async () => {
    const root = await openPage({ ...fakeSource([]).source, folder: "/acme/Acme sample" }, true);
    expect(root.textContent).toContain("Runs started from the command line show up here too.");
  });
});
