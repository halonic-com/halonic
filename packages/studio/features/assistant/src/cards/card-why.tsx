import { useEffect, useId, useRef, useState } from "react";
import { cardWords as words } from "./card-words.ts";

/** Whether the three-line clamp hides part of `element`: lines break by width, so only a measure tells. */
function isClamped(element: HTMLElement | null): boolean {
  return element !== null && element.scrollHeight > element.clientHeight;
}

/**
 * The model's why, quoted, at most 3 lines (flow-assistant 3.2), so a long one doesn't push Show
 * the diff and the buttons down the 360px panel. Only when it's cut, **more** under it shows the
 * rest; then the button is gone, with no "less".
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
  return (
    <>
      <p
        id={textId}
        ref={text}
        className={`text-small text-fg-muted [overflow-wrap:anywhere] ${opened ? "" : "line-clamp-3"}`}
      >
        “{why}”
      </p>
      {clamped && !opened ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={textId}
          className="self-start text-small text-primary focus-ring"
          onClick={() => setOpened(true)}
        >
          {words.more}
        </button>
      ) : null}
    </>
  );
}
