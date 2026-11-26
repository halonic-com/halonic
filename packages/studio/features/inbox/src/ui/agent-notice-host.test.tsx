// @vitest-environment jsdom
import { AgentMessagingService, type AgentNotice, type Notifier } from "@halonicjs/studio-services";
import { createShell } from "@halonicjs/studio-shell";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentNotifierService, InboxRunsService } from "../api.ts";
import { fakeRuns, WorkspaceServices } from "../fake-runs.test-helper.ts";
import { inboxFeature } from "../feature.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentNoticeHost } from "./agent-notice-host.tsx";

afterEach(() => unmountAll());

/** Keeps the title of every notice shown. */
class RecordingNotifier implements Notifier {
  readonly titles: string[] = [];

  show(notice: AgentNotice): Promise<void> {
    this.titles.push(notice.title);
    return Promise.resolve();
  }
}

/** The Inbox's notice host in a workspace with a fake Paperclip source. */
async function mounted() {
  const shell = createShell({
    features: [inboxFeature],
    hostServices: [InboxRunsService, AgentMessagingService, AgentNotifierService],
  });
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const notifier = new RecordingNotifier();
  const workspace = new WorkspaceServices();
  workspace.provide(InboxRunsService, fakeRuns([]).runs);
  workspace.provide(AgentMessagingService, messaging);
  workspace.provide(AgentNotifierService, notifier);
  shell.services.instantiate(workspace);
  const host = shell.contributions.dialogs.list().find((one) => one.id === "inbox.agent-notices");
  const read = vi.spyOn(messaging, "listWork");
  render(<AgentNoticeHost context={shell.services.contextFor("inbox", workspace)} />);
  // The watch's first read sets what is already there; a card after it is new.
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  await act(() => read.mock.results[0]?.value);
  const addCard = () =>
    messaging.addInboxItem(source.id, {
      question: "Ship the release?",
      from: { kind: "person", name: "Ops lead" },
    });
  return { host, notifier, addCard };
}

verifies("inbox.agent-notifications-start", () => {
  it("is the Inbox's dialog host, and shows one notification for a new card", async () => {
    const { host, notifier, addCard } = await mounted();
    expect(await host?.load()).toHaveProperty("AgentNoticeHost");

    addCard();

    await vi.waitFor(() => expect(notifier.titles).toEqual(["New card from Ops lead"]));
  });

  it("shows nothing once the window closes", async () => {
    const { notifier, addCard } = await mounted();

    await act(async () => unmountAll());
    addCard();
    await act(async () => undefined);

    expect(notifier.titles).toEqual([]);
  });
});
