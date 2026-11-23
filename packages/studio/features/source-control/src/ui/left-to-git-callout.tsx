import { Callout, CommandBox, ExternalLink } from "@halonicjs/studio-kit";
import { updatesWords } from "../changes-words.ts";

/**
 * The git steps under Get updates after it was refused over a file Halonic leaves to git (C716
 * row 1): the toast only names the files, and here `git pull --no-rebase` sits in a box to copy
 * instead of breaking across lines in the toast's narrow column. Shows nothing otherwise; it goes
 * when Get updates is pressed again. The how-to link gives the same steps in more detail (C714
 * row 7).
 */
export function LeftToGitCallout({ shown }: { readonly shown: boolean }) {
  if (!shown) return null;
  return (
    <Callout tone="info">
      <div className="flex flex-col gap-1">
        <p>{updatesWords.leftToGitLead}</p>
        <CommandBox command={updatesWords.leftToGitCommand} />
        <p>{updatesWords.leftToGitAfter}</p>
        <p>
          <ExternalLink href={updatesWords.leftToGitHowTo}>
            {updatesWords.leftToGitHowToTitle}
          </ExternalLink>
        </p>
      </div>
    </Callout>
  );
}
