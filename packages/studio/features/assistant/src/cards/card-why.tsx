import { standaloneLinkClasses } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { cardWords as words } from "./card-words.ts";

/** Whether the three-line clamp hides part of `element`: lines break by width, so only a measure tells. */
function isClamped(element: HTMLElement | null): boolean {
  return element !== null && element.scrollHeight > element.clientHeight;
}

/**
 * The model's why, quoted, at most 3 lines (flow-assistant 3.2), so a long one doesn't push Show
 * the diff and the buttons down the 360px panel. Only when it's cut, **more** under it shows the
 * rest; then the button is gone, with no "less", so focus moves to the text rather than falling to
 * the page (HAL-17850).
 */
export function CardWhy({ why }: { readonly why: string }) {
  const textId = useId();
  const text = useRef<HTMLParagraphElement>(null);
  const [opened, setOpened] = useState(false);
  const [clamped, setClamped] = useState(false);
  // Measured, not guessed from the length: a narrow panel or a large font clamps short text too.
  useEffect(() => {
    if (opened) return;
    const measure = () => setClamped(isClamped(text.current));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [opened, why]);
  useEffect(() => {
    if (opened) text.current?.focus();
  }, [opened]);
  return (
    <>
      <p
        id={textId}
        ref={text}
        tabIndex={-1}
        className={`text-small text-fg-muted wrap-anywhere focus-ring ${opened ? "" : "line-clamp-3"}`}
      >
        “{why}”
      </p>
      {clamped && !opened ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={textId}
          // On a phone the 48px tap area grows down from the text, not around it (flow-assistant 11.3).
          className={`self-start text-small font-medium ${standaloneLinkClasses} phone:items-start`}
          onClick={() => setOpened(true)}
        >
          {words.more}
        </button>
      ) : null}
    </>
  );
}
