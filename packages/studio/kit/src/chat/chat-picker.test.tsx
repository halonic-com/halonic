// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { ChatComposer, type ChatComposerProps } from "./chat-composer.tsx";
import type { ChatComposerPicker } from "./chat-picker.tsx";

afterEach(() => {
  unmountAll();
});

/** Acme's members, as a channel's `@` offers them. */
function picker(overrides: Partial<ChatComposerPicker> = {}): ChatComposerPicker {
  return {
    label: "Members",
    open: true,
    options: [
      { id: "chief", content: "Chief" },
      { id: "liam", content: "Liam" },
      { id: "elena", content: "Elena" },
    ],
    onPick: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function composer(overrides: Partial<ChatComposerProps> = {}) {
  const props: ChatComposerProps = {
    label: "Message Engineering",
    placeholder: "Message Engineering",
    value: "@",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    answering: false,
    picker: picker(),
    ...overrides,
  };
  const { container } = render(<ChatComposer {...props} />);
  const box = container.querySelector("textarea") as HTMLTextAreaElement;
  return { props, container, box };
}

function press(box: HTMLTextAreaElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    box.dispatchEvent(event);
  });
  return event;
}

/** The text of the option the box names as active. */
function active(container: HTMLElement, box: HTMLTextAreaElement): string | null | undefined {
  const id = box.getAttribute("aria-activedescendant") ?? "";
  const option = container.querySelector(`[id="${id}"]`);
  expect(option?.getAttribute("role")).toBe("option");
  expect(option?.getAttribute("aria-selected")).toBe("true");
  return option?.textContent;
}

verifies("kit.chat-composer-picker", () => {
  describe("a ChatComposer with a picker", () => {
    it("is a combobox naming the active option of its listbox, and ArrowDown moves it", () => {
      const { container, box } = composer();
      expect(box.getAttribute("role")).toBe("combobox");
      expect(box.getAttribute("aria-expanded")).toBe("true");
      const listbox = container.querySelector("[role=listbox]") as HTMLElement;
      expect(box.getAttribute("aria-controls")).toBe(listbox.id);
      expect(listbox.getAttribute("aria-labelledby")).not.toBeNull();
      expect(
        container.querySelector(`[id="${listbox.getAttribute("aria-labelledby")}"]`)?.textContent,
      ).toBe("Members");
      expect(
        [...listbox.querySelectorAll("[role=option]")].map((each) => each.textContent),
      ).toEqual(["Chief", "Liam", "Elena"]);
      expect(active(container, box)).toBe("Chief");
      expect(press(box, "ArrowDown").defaultPrevented).toBe(true);
      expect(active(container, box)).toBe("Liam");
      expect(container.querySelectorAll("[aria-selected=true]")).toHaveLength(1);
      press(box, "ArrowUp");
      press(box, "ArrowUp");
      expect(active(container, box)).toBe("Elena");
    });

    it("picks the active option on Enter and sends nothing", () => {
      const { props, box } = composer();
      press(box, "ArrowDown");
      expect(press(box, "Enter").defaultPrevented).toBe(true);
      expect(props.picker?.onPick).toHaveBeenCalledWith("liam");
      expect(props.onSend).not.toHaveBeenCalled();
    });

    it("closes on Esc", () => {
      const { props, box } = composer();
      expect(press(box, "Escape").defaultPrevented).toBe(true);
      expect(props.picker?.onClose).toHaveBeenCalledTimes(1);
    });

    it("picks a clicked option and keeps focus in the box", async () => {
      const { props, container, box } = composer();
      box.focus();
      const elena = [...container.querySelectorAll("[role=option]")][2] as HTMLElement;
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      elena.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      await click(elena);
      expect(props.picker?.onPick).toHaveBeenCalledWith("elena");
      expect(document.activeElement).toBe(box);
    });

    it("outlines the active option, so high contrast still shows it (HAL-18316 KT1)", () => {
      const { container, box } = composer();
      const id = box.getAttribute("aria-activedescendant") ?? "";
      const classes = container.querySelector(`[id="${id}"]`)?.className.split(" ") ?? [];
      expect(classes).toEqual(
        expect.arrayContaining([
          "outline-transparent",
          "aria-selected:outline-solid",
          "contrast-more:aria-selected:outline-border-control",
        ]),
      );
    });

    it("leaves the keys to an input method that is composing", () => {
      const { props, container, box } = composer();
      press(box, "ArrowDown", { isComposing: true });
      press(box, "Escape", { isComposing: true });
      expect(active(container, box)).toBe("Chief");
      expect(props.picker?.onClose).not.toHaveBeenCalled();
    });

    it.each([
      ["closed", { open: false }],
      ["open with no options", { options: [] }],
    ])("sends on Enter while the picker is %s, and isn't expanded", (_, overrides) => {
      const { props, container, box } = composer({ value: "@Li hi", picker: picker(overrides) });
      expect(box.getAttribute("role")).toBe("combobox");
      expect(box.getAttribute("aria-expanded")).toBe("false");
      expect(box.hasAttribute("aria-activedescendant")).toBe(false);
      expect(container.querySelector("[role=listbox]")).toBeNull();
      press(box, "Enter");
      expect(props.onSend).toHaveBeenCalledTimes(1);
      expect(props.picker?.onPick).not.toHaveBeenCalled();
    });
  });

  it("is a plain box without a picker", () => {
    const { box } = composer({ picker: undefined });
    expect(box.hasAttribute("role")).toBe(false);
    expect(box.hasAttribute("aria-expanded")).toBe(false);
  });
});
