// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type OutgoingFeedback, SendFeedback } from "./send-feedback.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The shell's answer to `plugin:feedback|crop`: a 20 × 10 crop, its size first. */
function cropBytes(): ArrayBuffer {
  const bytes = new Uint8Array(8 + 20 * 10 * 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 20, true);
  header.setUint32(4, 10, true);
  return bytes.buffer;
}

function fakeShell() {
  return {
    invoke: vi.fn(async (command: string): Promise<unknown> => {
      if (command === "plugin:feedback|crop") return cropBytes();
      return null;
    }),
  };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const details = {
  project: "Acme apps",
  assignee: "Robin",
  studioVersion: "0.2.0",
  mac: false,
  now: () => new Date("2026-11-25T17:04:05Z"),
};

const canvasPrototype = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
let root: Root | undefined;
let element: HTMLDivElement;

beforeEach(() => {
  canvasPrototype["getContext"] = () => ({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: () => undefined,
  });
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  element.remove();
  delete canvasPrototype["getContext"];
});

async function open(shell = fakeShell()) {
  const sent: OutgoingFeedback[] = [];
  const send = vi.fn(async (feedback: OutgoingFeedback) => void sent.push(feedback));
  await act(async () => {
    root = createRoot(element);
    root.render(
      <SendFeedback ipc={shell} send={send} details={details} encodePng={async () => png} />,
    );
  });
  await vi.waitFor(() => expect(element.textContent).toContain("20 × 10"));
  return { shell, send, sent };
}

function textField(): HTMLTextAreaElement {
  const found = element.querySelector("textarea");
  if (found === null) throw new Error("No text field.");
  return found;
}

/** Types `text` as React hears it: the native setter, then an input event. */
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(textField(), text);
    textField().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll("button")].find((each) => each.textContent === label);
  if (found === undefined) throw new Error(`No ${label} button.`);
  return found;
}

function ends(shell: ReturnType<typeof fakeShell>) {
  return shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|end");
}

verifies("feedback.send-window", () => {
  it("shows the crop's size, the field with its placeholder and the footnote", async () => {
    await open();
    expect(element.querySelector("h1")?.textContent).toBe("Send feedback");
    expect(textField().placeholder).toBe("What did you notice? The first line becomes the title.");
    expect(document.activeElement).toBe(textField());
    expect(element.textContent).toContain(
      "Goes to Acme apps as a task for Robin, with the app, window, time and Studio version.",
    );
    expect(element.textContent).toContain("CtrlEntersend");
  });

  it("sends once with text, with the crop as a PNG, then ends", async () => {
    const { shell, send, sent } = await open();
    type("Run list jumps\nIt scrolls to the top");
    await act(async () => button("Send").click());
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    expect(send).toHaveBeenCalledOnce();
    expect(sent[0]?.png).toBe(png);
    expect(sent[0]?.task).toMatchObject({
      title: "Run list jumps",
      project: "Acme apps",
      assignee: "Robin",
      screenshot: { width: 20, height: 10, contentType: "image/png" },
    });
  });

  it("sends on Ctrl Enter in the text field", async () => {
    const { send } = await open();
    type("Run list jumps");
    await act(async () => {
      textField().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
      );
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  });

  it("says to write a line when the text is empty, and sends nothing", async () => {
    const { shell, send } = await open();
    type("   \n ");
    await act(async () => button("Send").click());
    expect(element.textContent).toContain("Write a line about what you saw.");
    expect(document.activeElement).toBe(textField());
    expect(send).not.toHaveBeenCalled();
    expect(ends(shell)).toEqual([]);
  });

  it("ends on Cancel and on Esc, sending nothing", async () => {
    const { shell, send } = await open();
    type("Run list jumps");
    act(() => button("Cancel").click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(ends(shell)).toHaveLength(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("stays open with the text when the feedback can't be handed on", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const shell = fakeShell();
    await act(async () => {
      root = createRoot(element);
      root.render(
        <SendFeedback
          ipc={shell}
          send={async () => {
            throw new Error("no main window");
          }}
          details={details}
          encodePng={async () => png}
        />,
      );
    });
    await vi.waitFor(() => expect(element.textContent).toContain("20 × 10"));
    type("Run list jumps");
    await act(async () => button("Send").click());
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(ends(shell)).toEqual([]);
    expect(textField().value).toBe("Run list jumps");
    errors.mockRestore();
  });

  it("ends when the crop is gone", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const shell = fakeShell();
    shell.invoke.mockImplementation(async (command: string) => {
      if (command === "plugin:feedback|crop") throw "gone";
      return null;
    });
    await act(async () => {
      root = createRoot(element);
      root.render(<SendFeedback ipc={shell} send={vi.fn()} details={details} />);
    });
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    errors.mockRestore();
  });
});
