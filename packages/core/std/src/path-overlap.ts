// Whether two absolute paths overlap, the way Windows reads them, on every
// system: the one rule for a folder near a place it must stay clear of. Pure,
// so the core can use it too; `@halonicjs/adapter-system-node` resolves
// relative paths and links around it (`pathsOverlap`, `bothSpellings`).

/**
 * Whether `a` is on, above or inside `b`: the same path, a folder holding
 * it, or a path inside it, after `.` and `..` are resolved. Both paths are
 * absolute, such as `/person/.ssh` or `C:/Work`.
 *
 * The paths are compared as Windows reads them, on every system: letter
 * case is ignored and `/` and `\` both separate folders. Elsewhere that
 * finds a few more paths overlapping than it must, never fewer. Links are
 * not followed.
 *
 * @example
 * absolutePathsOverlap("/person", "/person/.ssh"); // true: it holds it
 * absolutePathsOverlap("/person/.ssh-notes", "/person/.ssh"); // false
 * absolutePathsOverlap("C:/Work/Acme", "c:/WORK/acme/x"); // true
 */
export function absolutePathsOverlap(a: string, b: string): boolean {
  const first = asWindowsReadsIt(a);
  const second = asWindowsReadsIt(b);
  return insideOrSame(first, second) || insideOrSame(second, first);
}

/**
 * Whether `child` is `parent` or lies inside it, as Windows reads paths:
 * without regard to letter case, with `/` and `\` both as separators. Both
 * paths should be resolved first.
 */
export function insideOrSame(parent: string, child: string): boolean {
  const base = parent.toLowerCase();
  const path = child.toLowerCase();
  return path === base || path.startsWith(base.endsWith("\\") ? base : `${base}\\`);
}

/**
 * An absolute path with `\` between its names, `.`, `..` and repeated
 * separators resolved, and no `\` at the end but for a root: `/a/./b/` is
 * `\a\b`. The leading separators are kept, so a `\\server\share` path stays
 * one, and a `..` never takes away a drive such as `C:`.
 */
function asWindowsReadsIt(path: string): string {
  const unified = path.replaceAll("/", "\\");
  const lead = /^\\*/u.exec(unified)?.[0] ?? "";
  const names: string[] = [];
  for (const name of unified.slice(lead.length).split("\\")) {
    if (name === "" || name === ".") continue;
    if (name === "..") {
      if (names.length > 1 || (names.length === 1 && !names[0]?.endsWith(":"))) names.pop();
      continue;
    }
    names.push(name);
  }
  const drive = names.length === 1 && names[0]?.endsWith(":") === true;
  return lead + names.join("\\") + (drive ? "\\" : "");
}
