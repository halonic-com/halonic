// The rules for a path that must stay inside one folder: an agent's working
// folder in the workspace, or a file in a plugin's folder. They decide what a
// program on the person's computer can touch, so one set of rules serves both.

/** The words a message uses for the folder a path must stay in, and for one part of it. */
export type PathPlace = {
  /** The folder the path is relative to, such as `the workspace`. */
  readonly root: string;
  /** What one part of the path is, such as `folder name`. */
  readonly part: string;
};

/**
 * A name as a case-insensitive file system sees it: compatibility forms
 * folded (`ｈｕｂｓ` is `hubs`) and case folded (`ſ` and `S` are `s`).
 *
 * @example
 * foldName(".GIT"); // ".git"
 */
export function foldName(name: string): string {
  return name.normalize("NFKC").toUpperCase().toLowerCase();
}

/**
 * Why a path can't be used inside `place`, or `null` when it can. It must be
 * relative, with `/` between its parts, and stay inside the folder. Parts
 * that Windows or macOS would read as another name are refused too: a
 * trailing `.` or space, a `:` (a drive or an NTFS stream), an 8.3 short name
 * such as `GIT~1`, control characters and invisible code points. The checks
 * run on the path after {@link foldName}, so `ａｇｅｎｔｓ．/x` fails like
 * `agents./x`. Symlinks are resolved later, when the program starts.
 *
 * @param path - the path as written in the file
 * @param place - the words the message uses
 * @returns a message, or `null`
 */
export function relativePathProblem(path: string, place: PathPlace): string | null {
  if (/[\p{Cc}\p{Default_Ignorable_Code_Point}]/u.test(path)) {
    return `Don't use control characters or invisible characters in a ${place.part}`;
  }
  const folded = foldName(path);
  if (folded.includes("\\")) return "Use '/' between folders";
  if (folded.startsWith("/") || /^[a-z]:/.test(folded)) {
    return `Use a path relative to ${place.root}`;
  }
  if (folded.includes(":")) return `Don't use ':' in a ${place.part}`;
  const parts = folded.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return `Use a path inside ${place.root}, without '.', '..' or empty parts`;
  }
  if (parts.some((part) => /[. ]$/.test(part))) {
    return `Don't end a ${place.part} with '.' or a space`;
  }
  if (parts.some((part) => /~\d/.test(part))) {
    return "Don't use '~' followed by a digit: Windows reads it as a short name";
  }
  return null;
}
