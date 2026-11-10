/** A long value cut to what the card shows first, and what that leaves out. */
export interface FoldedText {
  /** The text shown while folded, with long runs of empty lines already shortened. */
  readonly shown: string;
  /** The whole text, with the same runs shortened; shown after "Show more". */
  readonly full: string;
  /** Lines left out while folded. */
  readonly hiddenLines: number;
  /** Characters left out of the shown lines, when one line alone is too long. */
  readonly hiddenCharacters: number;
  /** The value's size, such as "1.2 MB", for a value large enough to say it; else `null`. */
  readonly size: string | null;
}

export interface FoldLimits {
  /** Lines shown while folded. */
  readonly lines: number;
  /** Characters shown while folded, so one very long line can't fill the card. */
  readonly characters: number;
}

/** Six lines and 2,000 characters, the card's default before "Show more" (INBOX-CARD-27). */
export const defaultFoldLimits: FoldLimits = { lines: 6, characters: 2000 };

/** A run of more empty lines than this becomes one marker line (INBOX-CARD-27). */
const emptyLinesKept = 3;
/** From this many bytes on, the fold also says the value's size (INBOX-CARD-05). */
const sizeShownFrom = 100 * 1024;

/**
 * Folds a value for the card: runs of more than 3 empty lines become one
 * `⟦40 empty lines⟧` line, then the text is cut after `limits.lines` lines
 * or `limits.characters` characters, whichever comes first. Nothing is cut
 * sideways: the card wraps long lines.
 *
 * @example
 * foldText("a\nb\nc", { lines: 2, characters: 100 }); // { shown: "a\nb", hiddenLines: 1, … }
 */
export function foldText(value: string, limits: FoldLimits = defaultFoldLimits): FoldedText {
  const lines = shortenEmptyRuns(value.replace(/\r\n/g, "\n").split("\n"));
  const full = lines.join("\n");
  let shown = lines.slice(0, limits.lines).join("\n");
  const hiddenLines = Math.max(0, lines.length - limits.lines);
  let hiddenCharacters = 0;
  if (shown.length > limits.characters) {
    const cut = cutAt(shown, limits.characters);
    // Counted in code points, so an emoji left out counts as the one character you see.
    hiddenCharacters = [...shown.slice(cut)].length;
    shown = shown.slice(0, cut);
  }
  const bytes = new TextEncoder().encode(value).length;
  return {
    shown,
    full,
    hiddenLines,
    hiddenCharacters,
    size: bytes >= sizeShownFrom ? sizeText(bytes) : null,
  };
}

/** True when the fold leaves something out, so the card shows its "Show more" button. */
export function isFolded(folded: FoldedText): boolean {
  return folded.hiddenLines > 0 || folded.hiddenCharacters > 0;
}

/**
 * The fold button's label, saying how much is hidden (INBOX-CARD-27):
 * "Show 38 more lines", or "Show 1,200 more characters" when only part of a
 * long line is hidden, with the size added for a large value.
 */
export function foldLabel(folded: FoldedText): string {
  const amount =
    folded.hiddenLines > 0
      ? `${count(folded.hiddenLines)} more ${folded.hiddenLines === 1 ? "line" : "lines"}`
      : `${count(folded.hiddenCharacters)} more ${folded.hiddenCharacters === 1 ? "character" : "characters"}`;
  return folded.size === null ? `Show ${amount}` : `Show ${amount} (${folded.size})`;
}

function shortenEmptyRuns(lines: readonly string[]): string[] {
  const out: string[] = [];
  let run = 0;
  const flush = () => {
    if (run > emptyLinesKept) out.push(`⟦${count(run)} empty lines⟧`);
    else for (let index = 0; index < run; index += 1) out.push("");
    run = 0;
  };
  for (const line of lines) {
    if (line.trim() === "") {
      run += 1;
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out;
}

/** Cuts before `at`, one character earlier when `at` would split a surrogate pair. */
function cutAt(text: string, at: number): number {
  const code = text.charCodeAt(at - 1);
  return code >= 0xd800 && code <= 0xdbff ? at - 1 : at;
}

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function count(value: number): string {
  return value.toLocaleString("en-GB");
}
