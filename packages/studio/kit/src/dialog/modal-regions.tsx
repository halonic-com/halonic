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

/** One `aria-live` region that a modal hands to the shell's announcer. */
export interface ModalLiveRegion {
  /** Clears the region and sets `text` on the next frame, so the same text is read again. */
  say(text: string): void;
}

/**
 * A modal's polite and assertive regions. The same shape as the shell's `LiveRegions`, written
 * here because the kit may not import the shell.
 */
export interface ModalLiveRegions {
  readonly polite: ModalLiveRegion;
  readonly assertive: ModalLiveRegion;
}

/**
 * Hands a modal's regions to the announcer while the modal is open, so `announce()` writes into
 * them: `aria-modal` hides the shell's own regions. Returns a function to call when it closes.
 */
export type PushModalRegions = (regions: ModalLiveRegions) => () => void;

const ModalRegionsContext = createContext<PushModalRegions | null>(null);

export interface ModalRegionsProviderProps {
  /** The shell passes its announcer's `pushModalRegions`. */
  readonly pushModalRegions: PushModalRegions;
  readonly children: ReactNode;
}

/**
 * Connects every Dialog inside it to the shell's announcer (component specs 8 and 23 A4). The
 * shell puts one at its root; without one, a Dialog's regions stay empty.
 *
 * @example
 * <ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
 *   <App />
 * </ModalRegionsProvider>
 */
export function ModalRegionsProvider({ pushModalRegions, children }: ModalRegionsProviderProps) {
  // A new `pushModalRegions` on every render (an inline arrow) must not re-push open Dialogs:
  // that would drop a text waiting for its frame and re-push children before their parents.
  const latest = useRef(pushModalRegions);
  useLayoutEffect(() => {
    latest.current = pushModalRegions;
  });
  const [stablePush] = useState(() => {
    const push: PushModalRegions = (regions) => latest.current(regions);
    return push;
  });
  return <ModalRegionsContext value={stablePush}>{children}</ModalRegionsContext>;
}

/**
 * A modal's two visually hidden live regions, given to the announcer while it's mounted. The
 * newest modal is pushed last, so it's the topmost one the announcer writes to. The assertive
 * region has no `role="alert"`, so a screen reader doesn't read it twice.
 */
export function ModalRegions() {
  const push = useContext(ModalRegionsContext);
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (push === null) {
      return;
    }
    const frames = new Set<number>();
    const release = push({
      polite: { say: (text) => say(polite, text, frames) },
      assertive: { say: (text) => say(assertive, text, frames) },
    });
    return () => {
      release();
      for (const frame of frames) {
        cancelAnimationFrame(frame);
      }
    };
  }, [push]);

  return (
    <>
      <div ref={polite} aria-live="polite" className="sr-only" />
      <div ref={assertive} aria-live="assertive" className="sr-only" />
    </>
  );
}

function say(region: RefObject<HTMLDivElement | null>, text: string, frames: Set<number>): void {
  const element = region.current;
  if (element === null) {
    return;
  }
  element.textContent = "";
  const frame = requestAnimationFrame(() => {
    frames.delete(frame);
    element.textContent = text;
  });
  frames.add(frame);
}
