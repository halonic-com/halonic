import { useEffect, useRef, useState } from "react";

/** How long typing pauses before the text is saved (flow-agents 5.1). */
export const SAVE_PAUSE_MS = 800;

/** What {@link useAutoSaved} hands a field. */
export interface AutoSaved {
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Saves at once, as leaving the field does. */
  readonly flush: () => void;
  /**
   * The sentence for the field's red border, or `null` while the text is fine to save. It can
   * appear while focus is in the field, so its Field sets `announceWhileFocused`.
   */
  readonly error: string | null;
  /** Whether the box holds text that isn't in the file: a mistake that shows, or a failed save. */
  readonly notSaved: boolean;
}

/**
 * A text field that saves by itself: after a pause in typing, and when the person leaves the
 * field. A text with a mistake (`check` returns its sentence) is not saved; it stays in the box
 * with the error until it's fixed. The error shows after the pause or when the field is left,
 * not on every key, and goes as soon as the text is fixed. A save that fails is tried again at
 * the next pause or when the field is left. The saved value arriving from outside replaces the
 * box only when the person hasn't changed it.
 */
export function useAutoSaved(
  saved: string,
  save: (next: string) => Promise<boolean>,
  check: (next: string) => string | null,
): AutoSaved {
  const [draft, setDraft] = useState(saved);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastSaved = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  const mistake = check(draft);
  const error = revealed ? mistake : null;

  // A change made elsewhere (the file edited) shows here while the box has nothing unsaved.
  useEffect(() => {
    if (saved !== lastSaved.current && latest.current === lastSaved.current) {
      setDraft(saved);
      setFailed(false);
      latest.current = saved;
    }
    lastSaved.current = saved;
  }, [saved]);

  const flush = () => {
    clearTimeout(timer.current);
    const text = latest.current;
    if (check(text) !== null) {
      setRevealed(true);
      return;
    }
    // The box holds what the file holds, so an earlier failed save no longer matters.
    if (text === lastSaved.current) {
      setFailed(false);
      return;
    }
    const before = lastSaved.current;
    lastSaved.current = text;
    void save(text).then((written) => {
      // Not written: the file still holds `before`, so the next pause or leave tries again.
      if (!written && lastSaved.current === text) lastSaved.current = before;
      if (latest.current === text) setFailed(!written);
    });
  };

  const onChange = (next: string) => {
    latest.current = next;
    setDraft(next);
    if (check(next) === null) setRevealed(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_PAUSE_MS);
  };

  // Leaving the page keeps what was typed.
  useEffect(() => flush, []);

  return { value: draft, onChange, flush, error, notSaved: error !== null || failed };
}

/**
 * Tells the page's `report` how many of its fields aren't saved, each time the number changes,
 * and 0 when the page goes, since its boxes go with it.
 */
export function useReportNotSaved(
  report: ((count: number) => void) | undefined,
  fields: readonly AutoSaved[],
): void {
  const count = fields.filter((field) => field.notSaved).length;
  useEffect(() => {
    report?.(count);
    return () => report?.(0);
  }, [report, count]);
}
