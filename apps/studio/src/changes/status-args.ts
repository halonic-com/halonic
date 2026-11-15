/** The arguments of the `git status` whose output `parseStatus` (from the ports) reads. */
export const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v2",
  "--untracked-files=all",
  "-z",
];
