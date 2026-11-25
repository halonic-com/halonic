// @vitest-environment jsdom
import {
  chatLibrary,
  OPENUI_MAX_CHARS,
  OpenUiComponent,
  type OpenUiReadResult,
  readOpenUi,
} from "@halonicjs/openui-lang";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "../button/button.tsx";
import { type OpenExternal, OpenExternalProvider } from "../external-link/open-external.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { ChatUi } from "./chat-ui.tsx";
import { BUTTONS_LINE, FORM_LINE } from "./chat-ui-controls.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const library = chatLibrary(["card", "table", "form", "buttons"]);

function draw(source: string, result: OpenUiReadResult = readOpenUi(source, library)) {
  const openExternal = vi.fn<OpenExternal>(async () => {});
  const onSend = vi.fn<(message: string) => void>();
  const { container } = render(
    <OpenExternalProvider openExternal={openExternal}>
      <ChatUi result={result} source={source} sender="Support desk" onSend={onSend} />
    </OpenExternalProvider>,
  );
  return { container, openExternal, onSend };
}

/** Types into a text box or text area the way React hears it. */
function type(element: Element | null, value: string) {
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pick(element: Element | null, value: string) {
  const select = element as HTMLSelectElement;
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function click(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

function buttonNamed(container: HTMLElement, name: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === name);
}

/** A tree the reader would never give, holding one part the renderer can't draw. */
function treeOf(part: OpenUiComponent): OpenUiReadResult {
  const root = new OpenUiComponent("Stack", { children: [part] });
  return { kind: "tree", root, errors: [], unresolved: [], orphans: [], incomplete: false };
}

const notShown = "Support desk sent something that couldn't be shown.";

verifies("kit.chat-ui", () => {
  it("draws a card with its facts, and a link with the host from its address", () => {
    const { container, openExternal } = draw(
      'root = Stack([Card("Refund", "Order 10482", [Fact("Amount", "€80")], [Link("Payments dashboard", "https://good.example@stripe-login.example.net/pay")])])',
    );
    expect(container.querySelector("h3")?.textContent).toBe("Refund");
    expect(container.querySelector("dl")?.textContent).toBe("Amount€80");
    expect(container.querySelector("li")?.textContent).toBe(
      "Payments dashboard ↗ (opens in your browser) (stripe-login.example.net)",
    );
    expect(openExternal).not.toHaveBeenCalled();
    click(container.querySelector("a"));
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://good.example@stripe-login.example.net/pay",
    );
  });

  it("uses no accent fill and no status colour in the agent's parts", () => {
    const { container } = draw(
      'root = Stack([Card("A", "b", [Fact("c", "d")]), Table(["n"], [Row([1])], "e"), Buttons([Button("Yes")]), Form("F", [Field("Name", "text")], "Send")])',
    );
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg-accent|bg-danger|text-danger|success|warning|attention)\b/,
    );
  });

  it("leaves an image out and never asks for it", () => {
    const { container } = draw('root = Stack([Image("https://example.com/cat.png"), Card("A")])');
    expect(container.querySelector("img, picture, [src], [srcset]")).toBeNull();
    expect(container.textContent).toContain("Image left out: chat doesn't show images yet.");
    expect(container.textContent).not.toContain("couldn't be shown");
  });

  it("shows 20 rows of a long table until Show all, numbers on the right", () => {
    const rows = Array.from({ length: 48 }, (_, index) => `Row(["Order ${index}", ${index}])`);
    const { container } = draw(
      `root = Stack([Table(["Order", "Amount"], [${rows.join(", ")}], "Refunds")])`,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(container.textContent).toContain("Showing 20 of 48 rows.");
    expect(container.querySelector("tbody td + td")?.className).toContain("text-end");
    click(buttonNamed(container, "Show all 48"));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(48);
    expect(container.textContent).not.toContain("Showing");
  });

  it("draws the agent's buttons small, outlined and grey, never like the approval button", () => {
    const { container, onSend } = draw(
      'root = Stack([Buttons([Button("Approve"), Button("Not now")])])',
    );
    const agent = buttonNamed(container, "Approve") as HTMLButtonElement;
    const { container: own } = render(
      <>
        <Button variant="secondary" size="sm">
          Approve
        </Button>
        <Button variant="primary" block>
          Approve
        </Button>
      </>,
    );
    const [quiet, approval] = own.querySelectorAll("button");
    expect(agent.className).toBe(quiet?.className);
    expect(agent.className).not.toBe(approval?.className);
    expect(agent.querySelector("svg")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe(BUTTONS_LINE);
    expect(BUTTONS_LINE).toBe("A button sends its words as your message.");
    click(buttonNamed(container, "Not now"));
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Not now");
  });

  it("sends a form's answers as one message, one line per field", () => {
    const { container, onSend } = draw(
      'root = Stack([Form("Reply", [Field("Note", "text"), Field("Details", "longText"), Field("Order", "list", ["10482", "10483"]), Field("Tone", "choice", ["Friendly", "Formal"]), Field("Ask a manager", "tickBox"), Field("Refund now", "tickBox")], "Draft the reply")])',
    );
    type(container.querySelector("input:not([type])"), "Sorry");
    type(container.querySelector("textarea"), "It came late.");
    pick(container.querySelector("select"), "10483");
    click(container.querySelector('input[type="radio"][value="Formal"]'));
    click(container.querySelector('input[type="checkbox"]'));
    expect(FORM_LINE).toBe("Sends your answers as your message.");
    expect(container.textContent).toContain(FORM_LINE);
    click(buttonNamed(container, "Draft the reply"));
    expect(onSend).toHaveBeenCalledExactlyOnceWith(
      "Draft the reply\nNote: Sorry\nDetails: It came late.\nOrder: 10483\nTone: Formal\nAsk a manager: yes\nRefund now: no",
    );
  });

  it("makes the buttons and the form's send button unavailable without onSend", () => {
    const source =
      'root = Stack([Buttons([Button("Yes")]), Form("F", [Field("Name", "text")], "Send")])';
    const { container } = render(
      <ChatUi result={readOpenUi(source, library)} source={source} sender="Support desk" />,
    );
    for (const name of ["Yes", "Send"]) {
      const button = buttonNamed(container, name);
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      const reason = container.querySelector(`[id="${button?.getAttribute("aria-describedby")}"]`);
      expect(reason?.textContent).toBe(name === "Yes" ? BUTTONS_LINE : FORM_LINE);
    }
  });

  it.each([
    ["over the size limit", "x".repeat(OPENUI_MAX_CHARS + 1)],
    ["with state", '$x = "a"\nroot = Stack([Card("A")])'],
    ["that doesn't parse", "root = = ]"],
  ])("falls back to the text a reply sent when it is %s", (_, source) => {
    const { container } = draw(source);
    expect(container.querySelector('[data-chat-ui="not-shown"]')?.textContent).toContain(notShown);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.querySelector("pre")?.textContent).toBe(source);
  });

  it("names the component it doesn't know", () => {
    const { container } = draw("root = Stack([Chart([1, 2])])");
    expect(container.textContent).toContain("Support desk sent a chart that couldn't be shown.");
  });

  it("shows a part that fails while it draws on its own reply only", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container: failed } = draw(
      "broken",
      treeOf(new OpenUiComponent("Table", { columns: 5 })),
    );
    const { container: fine } = draw('root = Stack([Card("Still here")])');
    expect(failed.textContent).toContain(notShown);
    expect(fine.textContent).toContain("Still here");
    expect(fine.textContent).not.toContain("couldn't be shown");
  });

  it("draws a reply again once a newer result for it streams in", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = treeOf(new OpenUiComponent("Chart", {}));
    const { container, rerender } = render(
      <ChatUi result={failing} source="" sender="Support desk" />,
    );
    expect(container.textContent).toContain(notShown);
    const source = 'root = Stack([Card("Now complete")])';
    rerender(<ChatUi result={readOpenUi(source, library)} source={source} sender="Support desk" />);
    expect(container.textContent).toBe("Now complete");
  });
});
