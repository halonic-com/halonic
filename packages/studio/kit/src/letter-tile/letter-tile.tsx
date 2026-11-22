/** The props of `LetterTile`. */
export interface LetterTileProps {
  /** The name the tile stands for: "Reporter". It shows its first letter, upper case. */
  readonly name: string;
  /**
   * `sm` (the default) is 28px, for a row; `lg` is 48px, for a product on Cloud's dashboard and on
   * its customer pages (HAL-16050).
   */
  readonly size?: "sm" | "lg" | undefined;
}

const SIZES = {
  sm: "size-7 rounded-lg text-small font-semibold",
  lg: "size-12 rounded-md text-heading",
} as const;

/**
 * The first letter of a name on an accent tile: what stands in for a logo or a picture on an
 * agent, a workflow, a routine, a plugin or a Cloud product. The letter is `accent-text`, which
 * keeps 4.5:1 on the `accent-soft` fill (`accent` doesn't). It's decoration: the name sits next to
 * it, so screen readers skip it.
 *
 * @example
 * <LetterTile name={agent.name} />
 * <LetterTile name={product.name} size="lg" />
 */
export function LetterTile({ name, size = "sm" }: LetterTileProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-accent-soft text-accent-text ${SIZES[size]}`}
    >
      {firstLetter(name)}
    </span>
  );
}

/** The name's first character, upper case, or "?" for an empty name. A whole emoji, not half. */
function firstLetter(name: string): string {
  return ([...name.trim()][0] ?? "?").toUpperCase();
}
