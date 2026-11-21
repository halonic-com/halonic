// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentStep, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import {
  buttonNamed,
  openDialogsInJsdom,
  show,
  typeInto,
  typeIntoArea,
  unmount,
} from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const writer = { hubId: "acme", id: "writer" };

const draftReply: AgentStep = {
  id: "draft-reply",
  description: "Drafts a reply to the customer.",
  instructions: "Write a short reply.",
  model: "smart",
  outputFields: ["subject", "body"],
  tools: ["send-mail"],
};

const host = (agentSteps: readonly AgentStep[] = []) =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [{ ...writer, name: "Writer", model: "fast", maxSteps: 8, agentSteps }],
  });

async function openAgentSteps(agents: AgentsHost) {
  const page = await show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentScreen host={agents} hubId="acme" id="writer" closeStack={createCloseStack()} />
    </ToastStoreProvider>,
  );
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Agent steps")
      ?.click(),
  );
  return page;
}

const topCard = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLElement>("section[aria-labelledby]")].find(
    (section) => section.querySelector("[data-top-card-title]") !== null,
  ) ?? null;

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;

verifies("agents.configuration.agent-steps", () => {
  it("says what an agent step is when there are none, with New agent step", async () => {
    const page = await openAgentSteps(host());
    expect(page.textContent).toContain("No agent steps yet");
    expect(page.textContent).toContain(
      "An agent step is a named piece of work inside this agent, with its own instructions, model and model call limit.",
    );
    expect(buttonNamed(page, "New agent step")).toBeDefined();
  });

  it("lists each agent step with its name and one line, and opens it as a card", async () => {
    const page = await openAgentSteps(host([draftReply, { id: "check", instructions: "Check." }]));
    const rows = [...page.querySelectorAll("[role=tabpanel] li")].map((row) => row.textContent);
    expect(rows).toEqual(["draft-replyDrafts a reply to the customer.", "check"]);

    await act(async () => buttonNamed(page, "draft-reply")?.click());
    const card = topCard(page) as HTMLElement;
    expect(card.querySelector("nav")?.textContent).toContain("Writer");
    expect(card.textContent).toContain("Write a short reply.");
    expect(card.textContent).toContain("smart");
    expect(card.textContent).toContain("subject, body");
    expect(card.textContent).toContain("send-mail");

    await act(async () => buttonNamed(card, "Writer")?.click());
    await act(async () => buttonNamed(page, "check")?.click());
    expect(topCard(page)?.textContent).toContain("fast, the agent's model");
    expect(topCard(page)?.textContent).toContain("8, the agent's limit");
    expect(topCard(page)?.textContent).toContain("Text");
    expect(topCard(page)?.textContent).toContain("All of Writer's tools");
  });

  it("says None when an agent step may use no tools", async () => {
    const page = await openAgentSteps(host([{ id: "check", instructions: "Check.", tools: [] }]));
    await act(async () => buttonNamed(page, "check")?.click());
    const tools = [...(topCard(page)?.querySelectorAll("dl > div") ?? [])].find(
      (row) => row.querySelector("dt")?.textContent === "Tools",
    );
    expect(tools?.querySelector("dd")?.textContent).toBe("None");
  });

  it("says JSON when an agent step answers in JSON with no fields", async () => {
    const page = await openAgentSteps(
      host([{ id: "check", instructions: "Check.", outputFields: [] }]),
    );
    await act(async () => buttonNamed(page, "check")?.click());
    const output = [...(topCard(page)?.querySelectorAll("dl > div") ?? [])].find(
      (row) => row.querySelector("dt")?.textContent === "Output",
    );
    expect(output?.querySelector("dd")?.textContent).toBe("JSON");
  });

  it("asks for a name and what it should do, then adds the agent step and opens its card", async () => {
    const agents = host();
    const page = await openAgentSteps(agents);
    await act(async () => buttonNamed(page, "New agent step")?.click());
    await act(async () => buttonNamed(dialog(), "Create")?.click());
    expect(dialog().textContent).toContain("Give it a name.");
    expect(dialog().textContent).toContain("Say what it should do.");

    await typeInto(dialog().querySelector("input") as HTMLInputElement, "Draft reply");
    await typeIntoArea(dialog().querySelector("textarea") as HTMLTextAreaElement, "Keep it short.");
    await act(async () => buttonNamed(dialog(), "Create")?.click());
    expect((await agents.settings(writer)).agentSteps.map((step) => step.id)).toEqual([
      "draft-reply",
    ]);
    expect(document.querySelector("dialog")).toBeNull();
    expect(topCard(page)?.querySelector("[data-top-card-title]")?.textContent).toBe("draft-reply");
  });

  it("says why a create failed and keeps the dialog", async () => {
    const agents = host();
    const page = await openAgentSteps({
      ...agents,
      addAgentStep: async () => {
        throw new Error("The disk is full.");
      },
    });
    await act(async () => buttonNamed(page, "New agent step")?.click());
    await typeInto(dialog().querySelector("input") as HTMLInputElement, "Draft reply");
    await typeIntoArea(dialog().querySelector("textarea") as HTMLTextAreaElement, "Go.");
    await act(async () => buttonNamed(dialog(), "Create")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))));
    expect(dialog().textContent).toContain("Couldn't create the agent step:");
  });

  it("drops an agent step's card when the agent step is gone", async () => {
    const agents = host([draftReply]);
    const page = await openAgentSteps(agents);
    await act(async () => buttonNamed(page, "draft-reply")?.click());
    expect(topCard(page)).not.toBeNull();
    // The memory host has no remove; an update without agent steps stands in for the file edited.
    await act(async () => {
      await agents.update(writer, { agentSteps: [] } as never);
    });
    expect(topCard(page)).toBeNull();
  });
});
