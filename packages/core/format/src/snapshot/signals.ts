import { type Path, parse } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import { checkSignal } from "../kinds/signal/checks.ts";
import { Signal } from "../kinds/signal/schema.ts";

/** Why a signal in a snapshot is refused, as a `SnapshotProblem` has it. */
interface SignalProblem {
  readonly code: string;
  readonly path: Path;
  readonly message: string;
}

/** The first place where `nameOf` gives a value again, as `code` at `signals[i].<at>`. */
function repeated(
  signals: readonly Signal[],
  nameOf: (signal: Signal) => string,
  at: readonly string[],
  code: string,
): SignalProblem[] {
  const seen = new Set<string>();
  return signals.flatMap((signal, index) => {
    const name = nameOf(signal);
    if (!seen.has(name)) {
      seen.add(name);
      return [];
    }
    return [
      {
        code,
        path: ["signals", index, ...at],
        // The path names the place; the value stays out, as it is the file's own text.
        message: `another signal already has this ${at.join(".")}`,
      },
    ];
  });
}

/**
 * The problems of a snapshot's signals beyond the schema: each signal's own
 * refusals (`format.signal-refusals`) at `signals[i]`, an id or a rule used
 * twice (`signal-id-twice`, `signal-rule-twice`), since two signals for one
 * rule would leave it unclear which settings count, and signals out of id
 * order (`signals-not-sorted`).
 *
 * @param signals - the snapshot's signals, which passed the schema
 * @returns every problem
 */
export function signalProblems(signals: readonly Signal[]): SignalProblem[] {
  const unsorted = signals.findIndex(
    (signal, at) => at > 0 && (signals[at - 1]?.id ?? "") > signal.id,
  );
  return [
    ...signals.flatMap((signal, index) =>
      checkSignal(signal).map(({ code, path, message }) => ({
        code,
        path: ["signals", index, ...path],
        message,
      })),
    ),
    ...repeated(signals, (signal) => signal.id, ["id"], "signal-id-twice"),
    ...repeated(signals, (signal) => signal.rule.run, ["rule", "run"], "signal-rule-twice"),
    ...(unsorted === -1
      ? []
      : [
          {
            code: "signals-not-sorted",
            path: ["signals", unsorted],
            message: "list the signals sorted by id",
          },
        ]),
  ];
}

/**
 * Reads one signal from a snapshot's `signals` list on its own, with the
 * schema and the refusals `readSnapshot` gives it, so the plugin's loader
 * can turn off just that signal's rule.
 *
 * @param data - one entry of the list, as JSON data
 * @returns the signal with its defaults filled in, or every problem found
 *
 * @example
 * readSignal({ version: 1, id: "watcher", rule: { run: "pr-watcher" } }); // ok, dryRun false
 */
export function readSignal(data: unknown): Result<Signal, SignalProblem[]> {
  const parsed = parse(Signal, data);
  if (!parsed.ok) {
    return err(parsed.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  const problems = checkSignal(parsed.value).map(({ code, path, message }) => ({
    code,
    path,
    message,
  }));
  return problems.length > 0 ? err(problems) : ok(parsed.value);
}
