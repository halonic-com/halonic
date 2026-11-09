/** The environment variables the output style depends on, by name. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** What {@link decideStyle} needs to know about one output stream and the command line. */
export interface StyleInputs {
  /** The process's environment: `NO_COLOR`, `FORCE_COLOR`, `TERM`, `CI` and the locale. */
  readonly env: Environment;
  /** Whether the stream is a terminal, rather than a pipe or a file. */
  readonly isTerminal: boolean;
  /** The operating system, as `process.platform` names it. */
  readonly platform: string;
  /** Whether `--no-color` was given. */
  readonly noColor: boolean;
  /** Whether `--json` was given. */
  readonly json: boolean;
}

/**
 * How one output stream looks, decided once per command line. Nothing else in
 * the CLI reads the environment or the flags to decide this.
 */
export interface OutputStyle {
  /** Whether the stream gets colour, bold and dim. Never needed to read the output. */
  readonly colour: boolean;
  /**
   * Whether a live ◌ line may be shown and replaced. Whether a question may be
   * asked isn't decided here: that follows stdin and `CI` (cli-output 1.7).
   */
  readonly live: boolean;
  /** Whether the marks are ✓ ✕ ! ◌ · ›, or their plain-text stand-ins. */
  readonly unicode: boolean;
}

/**
 * Decides the {@link OutputStyle} of one stream (cli-output 1.4 and 1.5).
 *
 * Colour is off for a pipe or file, `NO_COLOR`, `TERM=dumb`, `--no-color` and
 * `--json`; `FORCE_COLOR` turns it on, except against the flags. Live lines
 * share the switch, except that `NO_COLOR` only turns off colour, as its
 * standard promises, and `CI` only turns off live lines.
 *
 * @example
 * decideStyle({ env: { NO_COLOR: "1" }, isTerminal: true, platform: "linux", noColor: false, json: false });
 * // { colour: false, live: true, unicode: true }
 */
export function decideStyle(inputs: StyleInputs): OutputStyle {
  return {
    colour: colourIsOn(inputs),
    live: liveIsOn(inputs),
    unicode: outputIsUtf8(inputs),
  };
}

/** The style for tests and for text that is only ever compared: plain, with the Unicode marks. */
export const plainStyle: OutputStyle = { colour: false, live: false, unicode: true };

function colourIsOn({ env, isTerminal, noColor, json }: StyleInputs): boolean {
  if (noColor || json) {
    return false;
  }
  const forced = env["FORCE_COLOR"];
  if (isSet(forced)) {
    // FORCE_COLOR=0 is how Node and most tools spell "force it off".
    return isTruthy(forced);
  }
  if (isSet(env["NO_COLOR"])) {
    return false;
  }
  return isTerminal && !termIsDumb(env);
}

function liveIsOn({ env, isTerminal, noColor, json }: StyleInputs): boolean {
  if (noColor || json || !isTerminal || termIsDumb(env)) {
    return false;
  }
  // A CI system may give the command a terminal, but its log only keeps finished lines.
  return !isTruthy(env["CI"]);
}

/**
 * Whether the marks can be written as Unicode. Everywhere but Windows they
 * can, unless the locale names another character set: CI images often set
 * `LANG=C` and still keep UTF-8 logs, so `C` doesn't count. On Windows only
 * the old console isn't UTF-8; Windows Terminal, VS Code and a redirected
 * stream are.
 */
function outputIsUtf8({ env, isTerminal, platform }: StyleInputs): boolean {
  const locale = env["LC_ALL"] || env["LC_CTYPE"] || env["LANG"] || "";
  const charset = locale.split(".")[1]?.split("@")[0]?.toLowerCase();
  if (charset !== undefined && charset !== "utf-8" && charset !== "utf8") {
    return false;
  }
  if (platform !== "win32" || !isTerminal) {
    return true;
  }
  return isSet(env["WT_SESSION"]) || isSet(env["TERM_PROGRAM"]) || isSet(env["ConEmuANSI"]);
}

function termIsDumb(env: Environment): boolean {
  return env["TERM"] === "dumb";
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** A flag variable that is set and isn't `0` or `false`, as `CI` and `FORCE_COLOR` are read. */
function isTruthy(value: string | undefined): boolean {
  return isSet(value) && value !== "0" && value.toLowerCase() !== "false";
}
