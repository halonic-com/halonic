/**
 * A shell command that runs `script` with this Node, on every system. The
 * script must hold no `"`, `$` or `%`, which a shell would read itself.
 */
export function nodeCommand(script: string): string {
  return `"${process.execPath}" -e "${script}"`;
}
