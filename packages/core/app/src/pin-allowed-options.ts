// The runner options a pinned launch allows, as `app.package-runner-launch`
// asks: a short list per runner, so a spelling that `pin-overrides.ts`
// doesn't know, such as npm's `--reg` for `--registry`, is refused too.

import type { ConnectorPin } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { optionName, packageOptionValue, type RunnerWords } from "./pin-command.ts";

/**
 * The options each runner program may set before its command word, with a
 * pin: they only say whether to ask, how much to print, or which package to
 * fetch. Each runner documents them. Compared as written, before any `=`,
 * because npm, pnpm and pipx also read a shortened long option, such as
 * `--reg` or `--ind`, which a list of refused options can't hold.
 */
const npmOptions = new Set(["-y", "--yes", "-q", "--quiet", "--silent", "-p", "--package"]);
const pnpmOptions = new Set(["-s", "--silent", "--package"]);
const bunOptions = new Set(["--bun", "-p", "--package"]);
const uvOptions = new Set(["-q", "--quiet", "--isolated", "--from", "--with"]);

const allowedOptions: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["npx", npmOptions],
  ["npm", npmOptions],
  ["pnpx", pnpmOptions],
  ["pnpm", pnpmOptions],
  ["yarn", new Set(["-q", "--quiet", "-p", "--package"])],
  ["bunx", bunOptions],
  ["bun", bunOptions],
  ["uvx", uvOptions],
  ["uv", uvOptions],
  ["pipx", new Set(["-q", "--quiet", "--spec"])],
]);

/**
 * Programs that read their own options after the command word too, up to a
 * `--`. `npm exec @acme/mail-mcp --reg=<url>` fetches from `<url>`, while
 * `npx` and the other runners pass those words on to the package.
 */
const readsLateOptions = new Set(["npm"]);

/**
 * Checks that a pinned runner sets only the options it may: before its
 * command word, each word is the runner's subcommand, a `--`, a package
 * option's value, or an option of `allowedOptions` for its program. For
 * `npm`, each word after the command word, before a `--`, that starts with
 * `-` must be one of them too. `subcommands` are the runner's own, such as
 * `exec` for `npm exec`.
 */
export function checkAllowedOptions(
  pin: ConnectorPin,
  program: string,
  subcommands: readonly (readonly string[])[],
  { options, late }: RunnerWords,
): Result<ConnectorPin, string> {
  const allowed = allowedOptions.get(program) ?? new Set<string>();
  const subcommandWords = new Set(subcommands.flat());
  const isAllowed = (word: string): boolean => allowed.has(optionName(word));
  const before = options.filter(
    (word, index) =>
      word !== "--" &&
      !subcommandWords.has(word.toLowerCase()) &&
      packageOptionValue(options, index) === undefined &&
      !isAllowed(word),
  );
  const after = readsLateOptions.has(program)
    ? late.filter((word) => word.startsWith("-") && !isAllowed(word))
    : [];
  const refused = [...new Set([...before, ...after].map(optionName))];
  if (refused.length === 0) {
    return ok(pin);
  }
  const names = [...allowed].join(", ");
  return err(
    `the command sets ${refused.join(", ")}, which a pinned "${program}" doesn't take: it may only set ${names}`,
  );
}
