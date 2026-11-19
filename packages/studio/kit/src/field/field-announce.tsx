import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Reads a text politely through the shell's announcer. */
export type FieldAnnounce = (text: string) => void;

const FieldAnnounceContext = createContext<FieldAnnounce | null>(null);

/** The props of `FieldAnnounceProvider`. */
export interface FieldAnnounceProviderProps {
  /** The shell passes its announcer's polite channel. */
  readonly announce: FieldAnnounce;
  readonly children: ReactNode;
}

/**
 * Lets every Field inside it read an error that appears after focus has left it (WCAG 4.1.3,
 * a11y check K1). The shell puts one at its root; without one, a Field says nothing.
 *
 * @example
 * <FieldAnnounceProvider announce={(text) => announcer.announce(text)}>
 *   <App />
 * </FieldAnnounceProvider>
 */
export function FieldAnnounceProvider({ announce, children }: FieldAnnounceProviderProps) {
  // A new `announce` on every render (an inline arrow) must not re-run every Field's effect.
  const latest = useRef(announce);
  useLayoutEffect(() => {
    latest.current = announce;
  });
  const [stableAnnounce] = useState(() => {
    const stable: FieldAnnounce = (text) => latest.current(text);
    return stable;
  });
  return <FieldAnnounceContext value={stableAnnounce}>{children}</FieldAnnounceContext>;
}

/**
 * Announces "Label: error" once when a Field's error appears or changes while focus is outside
 * the Field, as after Tab from a field that checks its value on blur. While focus is inside, the
 * screen reader already reads the error as the control's description, so nothing is said: that
 * covers the forms that move focus to the field with the error. Focus is read a frame later, so a
 * form that moves it in an effect counts too. An error already there when the Field mounts isn't
 * news, and neither is the same error rendered again.
 *
 * `whileFocused` is for a field that checks its value after a pause in typing: there the error
 * appears under a control that already has focus, and NVDA and JAWS don't re-read a description
 * that changes under focus, so it's announced wherever focus is.
 */
export function useFieldErrorAnnouncement(
  field: RefObject<HTMLElement | null>,
  label: string,
  error: string | undefined,
  whileFocused = false,
): void {
  const announce = useContext(FieldAnnounceContext);
  const lastError = useRef(error);

  useEffect(() => {
    const previous = lastError.current;
    lastError.current = error;
    if (announce === null || error === undefined || error === previous) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (whileFocused || !field.current?.contains(document.activeElement)) {
        announce(`${label}: ${error}`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [announce, field, label, error, whileFocused]);
}
