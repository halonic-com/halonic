import { type ReactNode, useEffect, useId, useRef } from "react";

/** Props for {@link SandboxModal}. */
export interface SandboxModalProps {
  /** The small text above the title: "Step 2 of 3". Absent on a card that has none. */
  readonly step?: string;
  readonly title: string;
  /** Move focus to the title on mount, so a screen change doesn't leave focus on `<body>`. */
  readonly focusTitle?: boolean;
  readonly children: ReactNode;
}

/**
 * The frame of every onboarding screen: the halo breathing behind the centre of the window, and one
 * card on it. The card is a plain surface with a border and a soft shadow, 440px at most and about 60%
 * of the window high at most; it scrolls inside only as a last resort. There is no scrim, so the halo
 * stays visible, and the halo is decoration only: it carries no text and takes no pointer events
 * (`settings.sandbox-choice-flow`).
 */
export function SandboxModal({ step, title, focusTitle = false, children }: SandboxModalProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden bg-canvas p-6 phone:p-3">
      <div
        aria-hidden="true"
        data-testid="sandbox-halo"
        className="bg-halo-spot pointer-events-none absolute top-1/2 left-1/2 aspect-2/1 w-[880px] max-w-none -translate-x-1/2 -translate-y-1/2"
      />
      <section
        aria-labelledby={titleId}
        className="relative flex max-h-[60vh] min-h-0 w-full max-w-110 flex-col gap-4 overflow-y-auto rounded-lg border border-border-strong bg-surface p-6 shadow-2 [@media(max-height:560px)]:max-h-[90vh]"
      >
        <header className="flex flex-col gap-1">
          {step === undefined ? null : <p className="text-small text-fg-muted">{step}</p>}
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="text-section outline-none">
            {title}
          </h2>
        </header>
        {children}
      </section>
    </div>
  );
}
