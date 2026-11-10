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

const ModalPoliteContext = createContext<ModalLiveRegion | null>(null);

/**
 * The polite region of the modal a part is in, or `null` outside one. For a kit part that
 * confirms something while toasts wait for the modal to close: the CommandBox's "Copied".
 */
export function useModalPolite(): ModalLiveRegion | null {
  return useContext(ModalPoliteContext);
}

/**
 * A modal's two visually hidden live regions, given to the announcer while it's mounted. The
 * newest modal is pushed last, so it's the topmost one the announcer writes to. The assertive
 * region has no `role="alert"`, so a screen reader doesn't read it twice. The modal's content
 * goes in as `children`, which reach the polite region through `useModalPolite()`.
 */
export function ModalRegions({ children }: { readonly children?: ReactNode }) {
  const push = useContext(ModalRegionsContext);
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  // Texts still waiting for their frame, from the announcer and from the content alike.
  const [frames] = useState(() => new Set<number>());
  const [politeRegion] = useState<ModalLiveRegion>(() => ({
    say: (text) => say(polite, text, frames),
  }));

  useEffect(() => {
    return () => {
      for (const frame of frames) {
        cancelAnimationFrame(frame);
      }
      frames.clear();
    };
  }, [frames]);

  useEffect(() => {
    if (push === null) {
      return;
    }
    return push({
      polite: politeRegion,
      assertive: { say: (text) => say(assertive, text, frames) },
    });
  }, [push, politeRegion, frames]);

  return (
    <>
      <ModalPoliteContext value={politeRegion}>{children}</ModalPoliteContext>
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
