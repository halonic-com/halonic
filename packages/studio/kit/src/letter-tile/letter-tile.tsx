/** The props of `LetterTile`. */
export interface LetterTileProps {
  /** The name the tile stands for: "Reporter". It shows its first letter, upper case. */
  readonly name: string;
}

/**
 * The first letter of a name on a 28px accent tile: what stands in for a logo or a picture on an
 * agent, a workflow, a routine or a plugin. The letter is `accent-text`, which keeps 4.5:1 on the
 * `accent-soft` fill (`accent` doesn't). It's decoration: the name sits next to it, so screen
 * readers skip it.
 *
 * @example
 * <LetterTile name={agent.name} />
 */
export function LetterTile({ name }: LetterTileProps) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-small font-semibold text-accent-text"
    >
      {firstLetter(name)}
    </span>
  );
}

/** The name's first character, upper case, or "?" for an empty name. A whole emoji, not half. */
function firstLetter(name: string): string {
  return ([...name.trim()][0] ?? "?").toUpperCase();
}
