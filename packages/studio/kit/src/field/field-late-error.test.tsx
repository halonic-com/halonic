// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Input } from "../input/input.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Field } from "./field.tsx";
import { FieldAnnounceProvider } from "./field-announce.tsx";

const ERROR = "Enter a whole number from 1 to 64.";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** A Turn limit Field and the next control, the way Settings › Assistant lays them out. */
function form(error: string | null, announceWhileFocused = false) {
  return (
    <>
      <Field label="Turn limit" error={error} announceWhileFocused={announceWhileFocused}>
        <Input />
      </Field>
      <button type="button">Next</button>
    </>
  );
}

/** Renders the form inside a provider, with the error given later through `showError`. */
function renderForm(options: { provider?: boolean; whileFocused?: boolean } = {}) {
  const { provider = true, whileFocused = false } = options;
  const announced: string[] = [];
  const wrap = (error: string | null) =>
    provider ? (
      <FieldAnnounceProvider announce={(text) => announced.push(text)}>
        {form(error, whileFocused)}
      </FieldAnnounceProvider>
    ) : (
      form(error, whileFocused)
    );
  const { container, rerender } = render(wrap(null));
  const input = container.querySelector("input") as HTMLInputElement;
  const next = container.querySelector("button") as HTMLButtonElement;
  const setError = (error: string | null) => rerender(wrap(error));
  const showError = (error: string | null) => {
    setError(error);
    act(() => vi.advanceTimersToNextFrame());
  };
  return { container, input, next, announced, setError, showError };
}

verifies("kit.field-late-error", () => {
  it("announces an error that appears after focus has left the Field, once, with its label", () => {
    const { input, next, announced, showError } = renderForm();
    input.focus();
    next.focus();
    showError(ERROR);
    expect(announced).toEqual([`Turn limit: ${ERROR}`]);
  });

  it("says nothing while focus is on the Field's control", () => {
    const { input, announced, showError } = renderForm();
    input.focus();
    showError(ERROR);
    expect(announced).toEqual([]);
  });

  it("counts focus anywhere inside the Field, not only on the control", () => {
    const { container, announced, showError } = renderForm();
    const label = container.querySelector("label") as HTMLLabelElement;
    label.tabIndex = -1;
    label.focus();
    showError(ERROR);
    expect(announced).toEqual([]);
  });

  it("doesn't announce the same error again when it's rendered again", () => {
    const { next, announced, showError } = renderForm();
    next.focus();
    showError(ERROR);
    showError(ERROR);
    expect(announced).toHaveLength(1);
  });

  it("announces a different error, and an error that comes back after it was cleared", () => {
    const { next, announced, showError } = renderForm();
    next.focus();
    showError(ERROR);
    showError("Enter a number.");
    showError(null);
    showError("Enter a number.");
    expect(announced).toEqual([
      `Turn limit: ${ERROR}`,
      "Turn limit: Enter a number.",
      "Turn limit: Enter a number.",
    ]);
  });

  it("reads focus a frame later, so a form that moves focus to the field has it read only once", () => {
    const { input, next, announced, setError } = renderForm();
    next.focus();
    // The error shows while focus is still on the button, and the form moves it before the frame.
    setError(ERROR);
    input.focus();
    act(() => vi.advanceTimersToNextFrame());
    expect(announced).toEqual([]);
  });

  it("doesn't announce an error the Field already shows when it mounts", () => {
    const announced: string[] = [];
    render(
      <FieldAnnounceProvider announce={(text) => announced.push(text)}>
        {form(ERROR)}
      </FieldAnnounceProvider>,
    );
    act(() => vi.advanceTimersToNextFrame());
    expect(announced).toEqual([]);
  });

  it("announces nothing without a provider", () => {
    const { next, announced, showError } = renderForm({ provider: false });
    next.focus();
    showError(ERROR);
    expect(announced).toEqual([]);
  });

  it("doesn't make the error line a live region", () => {
    const { container, showError } = renderForm();
    showError(ERROR);
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });
});

verifies("kit.field-focused-error", () => {
  it("announces an error that appears while focus stays on the control, once", () => {
    const { input, announced, showError } = renderForm({ whileFocused: true });
    input.focus();
    showError(ERROR);
    expect(announced).toEqual([`Turn limit: ${ERROR}`]);
  });

  it("says nothing more when focus then leaves the Field", () => {
    const { input, next, announced, showError } = renderForm({ whileFocused: true });
    input.focus();
    showError(ERROR);
    next.focus();
    showError(ERROR);
    expect(announced).toHaveLength(1);
  });

  it("says nothing when the error is cleared", () => {
    const { input, announced, showError } = renderForm({ whileFocused: true });
    input.focus();
    showError(ERROR);
    showError(null);
    expect(announced).toHaveLength(1);
  });
});
