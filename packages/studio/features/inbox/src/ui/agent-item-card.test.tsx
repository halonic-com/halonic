// @vitest-environment jsdom

import type { InboxAnswer } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";

afterEach(unmountAll);

const asked = new Date(2026, 10, 24, 10, 0);

/** The card of a question with no options, from the source "Paperclip · Acme". */
async function questionCard() {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, {
    question: "What should the title be?",
    options: [],
  });
  const [read] = await messaging.listSources();
  return render(
    <AgentItemCard
      item={item}
      source={read}
      now={() => asked}
      answer={(answer) => messaging.answer(item.id, answer)}
      readAttachment={(attachment) => messaging.readAttachment(attachment)}
    />,
  );
}

function sendAnswer(root: HTMLElement): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent === "Send answer");
  if (found === undefined) throw new Error('no button "Send answer"');
  return found;
}

/** What a screen reader hears after the button's name: the text its description points at. */
function description(button: HTMLElement): string {
  const ids = button.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

async function type(root: HTMLElement, text: string) {
  const field = root.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("inbox.agent-inbox-items", () => {
  it("says why an empty Send answer is off, and drops the line once there is an answer", async () => {
    const root = await questionCard();
    const send = sendAnswer(root);
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(description(send)).toBe("Write an answer to send it.");
    expect(root.textContent).toContain("Write an answer to send it.");

    await type(root, "Halonic 0.3");
    expect(sendAnswer(root).getAttribute("aria-disabled")).not.toBe("true");
    expect(root.textContent).not.toContain("Write an answer to send it.");
  });

  it("titles a Paperclip hire approval in words and shows the hire's name and role", async () => {
    const messaging = new FakeAgentMessaging({ now: () => asked });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    // The question as the Paperclip provider maps a `hire_agent` approval (paperclip-client.approval-fields).
    const item = messaging.addInboxItem(source.id, {
      question: "Hire an agent\n\n- Name: Iris\n- Role: designer\n- Monthly budget: $50.00",
      options: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
        { id: "request-changes", label: "Request changes" },
      ],
    });
    const [read] = await messaging.listSources();
    const root = await render(
      <AgentItemCard
        item={item}
        source={read}
        now={() => asked}
        answer={(answer) => messaging.answer(item.id, answer)}
        readAttachment={(attachment) => messaging.readAttachment(attachment)}
      />,
    );
    expect(root.querySelector("h2, h3")?.textContent).toBe("Hire an agent");
    const fields = [...root.querySelectorAll("li")].map((line) => line.textContent);
    expect(fields).toEqual(["Name: Iris", "Role: designer", "Monthly budget: $50.00"]);
    const buttons = [...root.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toEqual(["Approve", "Reject", "Request changes"]);
  });

  it("shows a Paperclip secret proposal's name and reason with Approve and Reject", async () => {
    const messaging = new FakeAgentMessaging({ now: () => asked });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    // The question as the Paperclip provider maps a secret proposal (paperclip-client.board-requests).
    const item = messaging.addInboxItem(source.id, {
      question:
        "New secret: Acme deploy token\n\n- Key: ACME_DEPLOY_TOKEN\n\n**Why**\n\nThe website deploy needs it.",
      options: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ],
    });
    const [read] = await messaging.listSources();
    const root = await render(
      <AgentItemCard
        item={item}
        source={read}
        now={() => asked}
        answer={(answer) => messaging.answer(item.id, answer)}
        readAttachment={(attachment) => messaging.readAttachment(attachment)}
      />,
    );
    expect(root.querySelector("h2, h3")?.textContent).toBe("New secret: Acme deploy token");
    expect(root.textContent).toContain("The website deploy needs it.");
    const buttons = [...root.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toEqual(["Approve", "Reject"]);
  });
});

verifies("inbox.option-note", () => {
  /** The card of a Paperclip approval whose Request changes takes a required note, and what it sent. */
  async function approvalCard() {
    const messaging = new FakeAgentMessaging({ now: () => asked });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const item = messaging.addInboxItem(source.id, {
      question: "Hire an agent\n\n- Name: Iris",
      options: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
        {
          id: "request-changes",
          label: "Request changes",
          noteRequired: true,
          noteLabel: "What should change?",
        },
      ],
    });
    const [read] = await messaging.listSources();
    const sent: InboxAnswer[] = [];
    const root = await render(
      <AgentItemCard
        item={item}
        source={read}
        now={() => asked}
        answer={(answer) => {
          sent.push(answer);
          return messaging.answer(item.id, answer);
        }}
        readAttachment={(attachment) => messaging.readAttachment(attachment)}
      />,
    );
    return { root, sent };
  }

  function button(root: HTMLElement, name: string): HTMLButtonElement {
    const found = [...root.querySelectorAll("button")].find((b) => b.textContent === name);
    if (found === undefined) throw new Error(`no button "${name}"`);
    return found;
  }

  async function press(root: HTMLElement, name: string) {
    await act(async () => button(root, name).click());
  }

  it("shows no field until Request changes is pressed, then the field focused", async () => {
    const { root, sent } = await approvalCard();
    expect(root.querySelector("textarea")).toBeNull();
    expect([...root.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Approve",
      "Reject",
      "Request changes",
    ]);

    await press(root, "Request changes");
    const field = root.querySelector("textarea");
    expect(field?.labels?.[0]?.textContent).toBe("What should change?");
    expect(document.activeElement).toBe(field);
    expect([...root.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Request changes",
      "Cancel",
    ]);
    expect(sent).toEqual([]);
  });

  it("keeps Request changes off until its note is written, and says why with the field's label", async () => {
    const { root } = await approvalCard();
    await press(root, "Request changes");
    expect(button(root, "Request changes").getAttribute("aria-disabled")).toBe("true");
    expect(description(button(root, "Request changes"))).toBe("What should change?");
  });

  it("brings the buttons back and sends nothing on Cancel", async () => {
    const { root, sent } = await approvalCard();
    await press(root, "Request changes");
    await type(root, "Lower the budget");
    await press(root, "Cancel");
    expect(root.querySelector("textarea")).toBeNull();
    expect(button(root, "Approve").getAttribute("aria-disabled")).not.toBe("true");
    expect(document.activeElement).toBe(button(root, "Request changes"));
    expect(sent).toEqual([]);
  });

  it("closes the field on Escape, as Cancel does", async () => {
    const { root, sent } = await approvalCard();
    await press(root, "Request changes");
    const field = root.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(root.querySelector("textarea")).toBeNull();
    expect(sent).toEqual([]);
  });

  it("sends the note written under Request changes with the option", async () => {
    const { root, sent } = await approvalCard();
    await press(root, "Request changes");
    await type(root, "Lower the budget");
    expect(button(root, "Request changes").getAttribute("aria-disabled")).not.toBe("true");
    await press(root, "Request changes");
    expect(sent).toEqual([{ kind: "option", option: "request-changes", note: "Lower the budget" }]);
  });

  it("writes the note and Your answer in the kit's field box", async () => {
    const { root } = await approvalCard();
    await press(root, "Request changes");
    expect(root.querySelector("textarea")?.parentElement?.className).toContain(
      "border-border-control",
    );

    const question = await questionCard();
    expect(question.querySelector("textarea")?.parentElement?.className).toContain(
      "border-border-control",
    );
  });
});
