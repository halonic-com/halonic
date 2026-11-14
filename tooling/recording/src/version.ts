/**
 * The version in the window bar comes from the recorded program itself: the
 * capture runs `halonic --version` once, off camera, and saves what it
 * printed next to the cast. Nothing in the SVG is typed by hand.
 */

/** Where the title shows the version, as in "Terminal · Halonic {version}". */
export const versionPlaceholder = "{version}";

/** What `halonic --version` prints: "Halonic", a space and the version, on one line. */
const versionLine = /^Halonic (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/** Reads the version from what `halonic --version` printed. Throws with the output when it isn't one. */
export function versionFromOutput(output: string): string {
  const line = output.trim();
  const version = versionLine.exec(line)?.[1];
  if (version === undefined) {
    throw new Error(
      `"halonic --version" printed "${firstLine(line)}", not "Halonic" and a version.`,
    );
  }
  return version;
}

/** The title with `{version}` filled in from what `halonic --version` printed. */
export function titleWithVersion(title: string, versionOutput: string): string {
  return title.replaceAll(versionPlaceholder, versionFromOutput(versionOutput));
}

function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}
