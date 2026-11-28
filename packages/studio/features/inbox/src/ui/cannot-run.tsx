import { Button, Callout } from "@halonicjs/studio-kit";

/** Props for {@link CannotRun}. */
export interface CannotRunProps {
  readonly reasons: readonly string[];
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: boolean;
  readonly onDecline: () => void;
}

/**
 * An action request Halonic can't run: the reasons as plain text, never Markdown, and **Decline**,
 * so the agent hears it won't run. Nothing here can run it. Without reasons it shows nothing.
 */
export function CannotRun({ reasons, unavailable, busy, onDecline }: CannotRunProps) {
  if (reasons.length === 0) return null;
  return (
    <>
      <Callout tone="attention" title="Halonic can't run this card's stepper:">
        <ul className="list-disc pl-5">
          {reasons.map((reason) => (
            <li key={reason} className="wrap-break-word">
              <QuotedAsCode text={reason} />
            </li>
          ))}
        </ul>
      </Callout>
      <div>
        <Button variant="secondary" unavailable={unavailable} busy={busy} onClick={onDecline}>
          Decline
        </Button>
      </div>
    </>
  );
}

/**
 * A reason with what the validator quotes in backticks (a stepper's name, an address) set in code
 * type, without the backticks. Nothing else is read as Markdown. A stray backtick with no partner
 * leaves the whole reason as it came.
 */
function QuotedAsCode({ text }: { readonly text: string }) {
  const parts = text.split("`");
  const balanced = parts.length % 2 === 1;
  if (!balanced) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="font-mono text-code">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
