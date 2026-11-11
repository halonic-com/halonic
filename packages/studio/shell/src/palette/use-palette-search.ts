import { useEffect, useRef, useState } from "react";
import type { SearchProviderContribution } from "../points/commands.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { type FoundItems, searchProviders } from "./search-providers.ts";

/** What {@link usePaletteSearch} gives the palette. */
export interface PaletteSearch {
  /** What the providers found for the latest words they answered. */
  readonly found: FoundItems;
  /** The providers haven't answered the words in the box yet. */
  readonly searching: boolean;
  /** Asks the providers again for the same words: **Try again** on "Couldn't search". */
  tryAgain(): void;
}

const nothingFound: FoundItems = { results: [], failed: false };

/** One question to the providers: the words, and which time they are asked. */
interface Question {
  readonly words: string;
  readonly attempt: number;
}

/** What the providers last answered, and to which question. */
interface Answer {
  readonly question: Question;
  readonly found: FoundItems;
}

/** Before the first question, and after the box is cleared: nothing found to keep. */
const noAnswer: Answer = { question: { words: "", attempt: 0 }, found: nothingFound };

/**
 * Asks the search providers each time the palette's words change, and again on Try again. Only
 * the answer to the latest question counts: one that comes back after the words changed again is
 * dropped. While the providers look, what they found for the earlier words stays, so the rows
 * don't empty and fill again with every letter, but "Couldn't search" waits for the new answer.
 * With nothing typed, nothing is asked, and what was found is forgotten: the next words start
 * with nothing to keep.
 *
 * @param contextFor the workspace context of a feature, for the palette's target
 *
 * @example
 * const search = usePaletteSearch(words, shell.contributions.search.providers(), contextFor);
 */
export function usePaletteSearch(
  words: string,
  providers: readonly Registered<SearchProviderContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): PaletteSearch {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer>(noAnswer);
  // Forgotten while rendering the empty box, not in an effect after it, so React redraws at once
  // and no frame paints with an answer the box no longer asks for.
  if (words.trim() === "" && answer !== noAnswer) {
    setAnswer(noAnswer);
  }
  // Read when a question starts, so a new array or callback each render doesn't ask again.
  const sources = useRef({ providers, contextFor });
  sources.current = { providers, contextFor };

  useEffect(() => {
    if (words.trim() === "") {
      return;
    }
    const question: Question = { words, attempt };
    let latest = true;
    void searchProviders(words, sources.current.providers, sources.current.contextFor).then(
      (found) => {
        if (latest) {
          setAnswer({ question, found });
        }
      },
    );
    return () => {
      latest = false;
    };
  }, [words, attempt]);

  const answered = answer.question.words === words && answer.question.attempt === attempt;
  const searching = !answered && words.trim() !== "";
  return {
    found: searching ? { results: answer.found.results, failed: false } : answer.found,
    searching,
    tryAgain: () => setAttempt((count) => count + 1),
  };
}
