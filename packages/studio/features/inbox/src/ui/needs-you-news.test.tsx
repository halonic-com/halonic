// @vitest-environment jsdom
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { InboxRunsService, InboxService } from "../api.ts";
import { fakeRuns, WorkspaceServices } from "../fake-runs.test-helper.ts";
import { inboxFeature } from "../feature.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NeedsYouNews } from "./needs-you-news.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const asking = (id: string, title: string) => waitingRun(id, { waitingFor: { title, body: "" } });

verifies("inbox.needs-you-news", () => {
  it("is the Inbox's dialog host, and reads the news through the window's announcer", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const fake = fakeRuns([asking("r1", "Send it?")]);
    const workspace = new WorkspaceServices();
    workspace.provide(InboxRunsService, fake.runs);
    shell.services.instantiate(workspace);
    const inbox = workspace.get(InboxService);
    await inbox.refresh();
    const host = shell.contributions.dialogs
      .list()
      .find((one) => one.id === "inbox.needs-you-news");
    expect(await host?.load()).toHaveProperty("NeedsYouNews");
    const announceState = vi.spyOn(shell.announcer, "announceState");

    render(<NeedsYouNews context={shell.services.contextFor("inbox", workspace)} />);
    fake.change([asking("r1", "Send it?"), asking("r2", "Approve this reply?")]);
    await act(() => inbox.refresh());

    expect(announceState).toHaveBeenCalledWith(
      "inbox.needs-you",
      "Waiting for you: Approve this reply?. 2 waiting.",
    );
  });
});
