// The numbers in requirement `ports.untrusted-tool-listings`. Each is
// exported so tool assembly and its tests can name it instead of copying it.

/** The longest name, property name, `required` string, `$defs` name or `enum`/`const` string. */
export const maxNameLength = 64;

/** The most values an `enum` keeps. */
export const maxEnumValues = 64;

/** The longest tool description, or `description` or `title` in the parameters, in characters. */
export const maxTextLength = 10_000;

/**
 * How many objects and arrays deep the parameters may nest, counting the
 * root as 1. Generated schemas put shared types under `$defs` and stay far
 * shallower; the limit keeps the recursive rebuild cheap and safe.
 */
export const maxParameterDepth = 64;

/** The largest `parameters`, as the source sent them, in bytes of JSON (64 KiB). */
export const maxParametersBytes = 64 * 1024;

/** The most characters a listed tool's unfenced strings may add up to. */
export const maxUnfencedLength = 2_048;

/**
 * The most tools one listing may return. 128 is the most tools one OpenAI
 * request accepts, so a larger listing can't be offered whole anyway, and it
 * bounds the unfenced text of one listing to 128 × 2,048 characters.
 */
export const maxListedTools = 128;
