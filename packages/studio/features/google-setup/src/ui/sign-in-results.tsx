import { Callout, ExternalLink } from "@halonicjs/studio-kit";
import { allPassedText, resultText, type ServiceResultLine } from "./result-lines.ts";

/** Props for {@link SignInResults}. */
export interface SignInResultsProps {
  /** The account's address, for "Google is set up for …". */
  readonly email: string;
  /** How many services are ticked. "Google is set up" needs a passing result for each. */
  readonly ticked: number;
  /** The ticked services whose check ran after the last sign-in, in the order Studio shows them. */
  readonly lines: readonly ServiceResultLine[];
}

/**
 * What step 7 shows after a sign-in came back (design 3.5, items 3 and 4): one line per service,
 * and a single sentence when every ticked service has a current result and it passed. A service
 * that hasn't been checked since the sign-in shows nothing, so it can't be counted as passed.
 */
export function SignInResults({ email, ticked, lines }: SignInResultsProps) {
  if (lines.length === 0) return null;
  if (lines.length === ticked && lines.every((line) => resultText(line).passed)) {
    return <Callout tone="info">{allPassedText(email, lines)}</Callout>;
  }
  return (
    <ul className="flex flex-col gap-1 text-body">
      {lines.map((line) => {
        const text = resultText(line);
        return (
          <li key={line.service} className="flex flex-wrap items-center gap-x-2">
            <span aria-hidden="true">{text.passed ? "✓" : "✗"}</span>
            <span className="sr-only">{text.passed ? "Passed: " : "Failed: "}</span>
            <span>{text.text}</span>
            {text.enableUrl === undefined ? null : (
              <>
                <ExternalLink href={text.enableUrl}>Switch it on</ExternalLink>
                <span>then sign in again.</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
