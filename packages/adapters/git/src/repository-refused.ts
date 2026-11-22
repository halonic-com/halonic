/**
 * A repository the adapter won't work in: its git files are outside its
 * folder, or its config sets a key Halonic doesn't allow. Its `kind` is
 * `denied`, a rule saying no, so every surface shows the reason and the fix
 * instead of an error it can't explain (HAL-16336). The adapter's other
 * errors keep no kind.
 *
 * @example
 * throw new RepositoryRefusedError(
 *   "The repository's config sets include.path, which Halonic doesn't allow.",
 *   "Remove it from .git/config and try again.",
 * );
 */
export class RepositoryRefusedError extends Error {
  override readonly name = "RepositoryRefusedError";
  /** As `@halonicjs/std`'s error kinds name a rule that says no. */
  readonly kind = "denied";
  /** The one next step that lets Halonic work in the repository. */
  readonly fix: string;

  /**
   * @param message - what the repository does that Halonic doesn't allow, as a sentence
   * @param fix - the next step, as a sentence
   * @param options - `cause` keeps the error this one wraps
   */
  constructor(message: string, fix: string, options?: ErrorOptions) {
    super(message, options);
    this.fix = fix;
  }
}
