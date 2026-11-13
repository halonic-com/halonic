import type { PluginLoadProblem } from "../page/plugin-pages.ts";
import { problemPlace } from "./add-plugin-text.ts";

/** Each problem as the loader gives it: where, in mono, then the message, as plain text. */
export function ProblemList({ problems }: { readonly problems: readonly PluginLoadProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="mt-2 flex list-none flex-col gap-1">
      {problems.map((problem, index) => {
        const place = problemPlace(problem);
        return (
          // The loader can give two problems at the same place, so the index keeps keys apart.
          <li key={index} className="wrap-anywhere">
            {place === "" ? null : (
              <>
                <span className="font-mono">{place}</span>{" "}
              </>
            )}
            <span>{problem.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
