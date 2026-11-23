/**
 * The spark mark: a four-point star, filled, in the text colour. The title bar's panel button
 * puts it before "Assistant". It is not the text character ✦, which Inter lacks, so it looks the
 * same on every computer instead of borrowing whatever symbol font the system has.
 */
export function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5Q9 7 14.5 8 9 9 8 14.5 7 9 1.5 8 7 7 8 1.5z" />
    </svg>
  );
}
