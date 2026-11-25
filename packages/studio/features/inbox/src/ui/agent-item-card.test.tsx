// @vitest-environment jsdom

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
});
