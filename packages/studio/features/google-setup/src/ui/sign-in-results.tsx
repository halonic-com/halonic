import { Callout, ExternalLink } from "@halonicjs/studio-kit";
import { allPassedText, resultText, type ServiceResultLine } from "./result-lines.ts";

/** Props for {@link SignInResults}. */
export interface SignInResultsProps {
  /** The account's address, for "Google is set up for …". */
  readonly email: string;
  /** The ticked services with their last check, in the order Studio shows them. */
  readonly lines: readonly ServiceResultLine[];
}

/**
 * What step 7 shows after a sign-in came back (design 3.5, items 3 and 4): one line per service,
 * and a single sentence when every service passed. Nothing shows for a service that hasn't been
 * checked, so a record from before the check has no results.
 */
export function SignInResults({ email, lines }: SignInResultsProps) {
  if (lines.length === 0) return null;
  const texts = lines.map((line) => resultText(line));
  if (texts.every((text) => text.passed)) {
    return <Callout tone="info">{allPassedText(email, lines)}</Callout>;
  }
  return (
    <ul className="flex flex-col gap-1 text-body">
      {texts.map((text, index) => (
        <li key={lines[index]?.service} className="flex flex-wrap items-center gap-x-2">
          <span aria-hidden="true">{text.passed ? "✓" : "✗"}</span>
          <span className="sr-only">{text.passed ? "Passed: " : "Failed: "}</span>
          <span>{text.text}</span>
          {text.enableUrl === undefined ? null : (
            <ExternalLink href={text.enableUrl}>Switch it on</ExternalLink>
          )}
        </li>
      ))}
    </ul>
  );
}
