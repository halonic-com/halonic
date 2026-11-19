// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  type AutoSaved,
  SAVE_PAUSE_MS,
  useAutoSaved,
  useReportNotSaved,
} from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const noDigits = (text: string) => (/\d/.test(text) ? "No digits." : null);

/** One auto-saved field, handed to the test each render. */
function setup(saved: string, save: (next: string) => Promise<boolean>) {
  let field: AutoSaved | undefined;
  const report = vi.fn<(count: number) => void>();
  function Field({ value }: { readonly value: string }) {
    field = useAutoSaved(value, save, noDigits);
    useReportNotSaved(report, [field]);
    return null;
  }
  render(<Field value={saved} />);
  return { field: () => field as AutoSaved, report };
}

it("saves after a pause in typing, and at once when flushed", async () => {
  const save = vi.fn(async () => true);
  const { field } = setup("Hello", save);

  act(() => field().onChange("Hello there"));
  expect(save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
  expect(save).toHaveBeenCalledWith("Hello there");

  act(() => field().onChange("Hi"));
  await act(async () => field().flush());
  expect(save).toHaveBeenLastCalledWith("Hi");
  expect(save).toHaveBeenCalledTimes(2);
});

it("keeps a text with a mistake out of the file, shows why once left, and counts it as not saved", async () => {
  const save = vi.fn(async () => true);
  const { field, report } = setup("Hello", save);

  act(() => field().onChange("Hello 2"));
  expect(field().error).toBeNull();
  await act(async () => field().flush());

  expect(save).not.toHaveBeenCalled();
  expect(field().error).toBe("No digits.");
  expect(field().notSaved).toBe(true);
  expect(report).toHaveBeenLastCalledWith(1);

  act(() => field().onChange("Hello two"));
  expect(field().error).toBeNull();
});

it("counts a failed save as not saved, and tries again when left", async () => {
  const save = vi.fn(async () => false);
  const { field } = setup("Hello", save);

  act(() => field().onChange("Hello there"));
  await act(async () => field().flush());
  expect(field().notSaved).toBe(true);

  save.mockResolvedValue(true);
  await act(async () => field().flush());
  expect(save).toHaveBeenCalledTimes(2);
  expect(field().notSaved).toBe(false);
});
