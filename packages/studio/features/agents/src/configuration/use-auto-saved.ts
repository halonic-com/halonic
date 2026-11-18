import { useEffect, useRef, useState } from "react";

/** How long typing pauses before the text is saved (flow-agents 5.1). */
export const SAVE_PAUSE_MS = 800;

/** What {@link useAutoSaved} hands a field. */
export interface AutoSaved {
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Saves at once, as leaving the field does. */
  readonly flush: () => void;
  /** The sentence for the field's red border, or `null` while the text is fine to save. */
  readonly error: string | null;
}

/**
 * A text field that saves by itself: after a pause in typing, and when the person leaves the
 * field. A text with a mistake (`check` returns its sentence) is not saved; it stays in the box
 * with the error until it's fixed. The saved value arriving from outside replaces the box only
 * when the person hasn't changed it.
 */
export function useAutoSaved(
  saved: string,
  save: (next: string) => Promise<boolean>,
  check: (next: string) => string | null,
): AutoSaved {
  const [draft, setDraft] = useState(saved);
  const lastSaved = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  const error = check(draft);

  // A change made elsewhere (the file edited) shows here while the box has nothing unsaved.
  useEffect(() => {
    if (saved !== lastSaved.current && latest.current === lastSaved.current) {
      setDraft(saved);
      latest.current = saved;
    }
    lastSaved.current = saved;
  }, [saved]);

  const flush = () => {
    clearTimeout(timer.current);
    const text = latest.current;
    if (text === lastSaved.current || check(text) !== null) return;
    lastSaved.current = text;
    void save(text);
  };

  const onChange = (next: string) => {
    latest.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_PAUSE_MS);
  };

  // Leaving the page keeps what was typed.
  useEffect(() => flush, []);

  return { value: draft, onChange, flush, error };
}
