/** The props of `Avatar`. */
export interface AvatarProps {
  /** The member's name: "Sofia Marin". It shows the first letters of its first two words. */
  readonly name: string;
}

/**
 * A member's initials on a 28px round tile: who is signed in, in Cloud's top bar (HAL-16050).
 * `surface-muted` and `fg-muted`, not the accent, so it doesn't read as a product. It's
 * decoration: the member's name is next to it, or in the top bar's name for screen readers.
 * Named `Avatar` so a picture can take its place later without a rename.
 *
 * @example
 * <Avatar name={member.name} />
 */
export function Avatar({ name }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-fg-muted"
    >
      {initials(name)}
    </span>
  );
}

/** The first letters of the first two words, upper case: "Sofia Marin" is "SM"; empty is "?". */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
