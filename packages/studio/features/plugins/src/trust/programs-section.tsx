// The trust check's Programs section: each program, and what this computer lets it do (the "Runs"
// line design section 6, HAL-1873; microcopy 24.1 R10, R11 and R11b).

import { Disclosure, inlineLinkClasses, WarningIcon } from "@halonicjs/studio-kit";
import { Items, Labelled } from "./plugin-location.tsx";
import {
  PROGRAM_SET_UP_FIX,
  PROGRAM_WINDOWS_ADDRESSES,
  type ProgramRow,
  programRow,
  SET_UP_AGENT_SANDBOX,
  type TrustFence,
} from "./runs-line.ts";
import type { TrustProgram } from "./trust-check.ts";
import {
  CAN_REACH,
  PROGRAMS_SECTION,
  type ProgramsRun,
  RUNS,
  sectionRow,
  VERSION,
} from "./trust-text.ts";

/**
 * Programs (R20). When the plugin's code isn't in the sandbox, it opens by itself and its row
 * gets the triangle; the words in its rows carry the warning (design section 3).
 */
export function ProgramsSection({
  programs,
  programsRun,
  fence,
  onSetUpSandbox,
}: {
  readonly programs: readonly TrustProgram[];
  readonly programsRun: ProgramsRun;
  readonly fence: TrustFence;
  readonly onSetUpSandbox: (() => void) | undefined;
}) {
  const notFenced = fence?.state === "not-fenced";
  return (
    <Disclosure
      summary={sectionRow(PROGRAMS_SECTION, programs.length)}
      defaultOpen={notFenced}
      {...(notFenced ? { mark: "warning" } : {})}
    >
      <Items>
        {programs.map((program) => (
          <li key={program.id} className="flex flex-col gap-1">
            <code className="font-mono text-small wrap-anywhere">{program.command}</code>
            <ProgramRuns
              row={programRow(programsRun, fence, program.tools)}
              onSetUpSandbox={onSetUpSandbox}
            />
            {program.version === undefined ? null : (
              <Labelled label={VERSION}>{program.version}</Labelled>
            )}
            {program.canReach.length === 0 ? null : (
              <Labelled label={CAN_REACH}>{program.canReach.join(", ")}</Labelled>
            )}
          </li>
        ))}
      </Items>
    </Disclosure>
  );
}

/**
 * A program's Runs value. On Windows, R10 follows in amber with the triangle, so the words and
 * the mark carry the warning; off because the agent sandbox isn't set up, R11b's fix follows,
 * with **Set up the agent sandbox** where the window can open Settings.
 */
function ProgramRuns({
  row,
  onSetUpSandbox,
}: {
  readonly row: ProgramRow;
  readonly onSetUpSandbox: (() => void) | undefined;
}) {
  return (
    <>
      <Labelled label={RUNS}>{row.runs}</Labelled>
      {row.kind === "runs" && row.windows ? (
        <p className="flex gap-2 text-small text-attention">
          <span aria-hidden="true" className="mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full">
            <WarningIcon />
          </span>
          <span>{PROGRAM_WINDOWS_ADDRESSES}</span>
        </p>
      ) : null}
      {row.kind === "off" && row.setUp ? (
        <p className="text-small text-fg-muted">
          {PROGRAM_SET_UP_FIX}
          {onSetUpSandbox === undefined ? null : (
            <>
              {" "}
              <button
                type="button"
                className={`font-medium ${inlineLinkClasses}`}
                onClick={onSetUpSandbox}
              >
                {SET_UP_AGENT_SANDBOX}
              </button>
            </>
          )}
        </p>
      ) : null}
    </>
  );
}
