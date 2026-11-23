import {
  type PluginPageProps,
  Spinner,
  StatusBadge,
  usePluginData,
} from "@paperclipai/plugin-sdk/ui";
import { workerAgentsDataKey } from "../keys.ts";
import type { BoardAgentTile, WorkerAgentsPage as PageData, WorkerRow } from "../page.ts";
import { ruleNames } from "../rule-checks.ts";
import { CheckCell, hidden, TaskLink } from "./cells.tsx";
import {
  allOkText,
  checksBanner,
  checksSummary,
  needsAttention,
  prDataBanner,
  rowStatusText,
  ruleHeaders,
  toggleText,
} from "./check-view.ts";
import { loadErrorCause, moreText, runText, summaryText, utcTime } from "./view.ts";

/**
 * The board's "Worker agents" page (addendum 2 on HAL-15997): the board
 * agents, then one row per worker agent with its 5 rule checks, worst first.
 * Read-only: its only call is the page's data, and "Try again" reads it
 * again; the all-OK agents fold into a native `<details>`. A plain table
 * instead of the SDK's `DataTable`, for row headers (HAL-16208, section 3.7).
 * It sets no colours of its own, so the host's light and dark themes apply.
 *
 * It imports nothing but the SDK: Paperclip's page provides React.
 */
export function WorkerAgentsPage({ context }: PluginPageProps) {
  const { data, loading, error, refresh } = usePluginData<PageData>(workerAgentsDataKey, {
    companyId: context.companyId,
  });
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <header>
        <h1>Worker agents</h1>
        <p>Does every worker agent follow the team rules? Read-only: this page changes nothing.</p>
      </header>
      {error !== null ? (
        <section role="alert">
          <h3>Couldn't load the checks</h3>
          <p>
            Cause <code>{loadErrorCause(error)}</code>. Nothing on this page has changed.
          </p>
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : null}
      {error === null && data === null && loading ? <Spinner label="Loading the checks" /> : null}
      {data === null ? null : <Page page={data} companyPrefix={context.companyPrefix} />}
    </div>
  );
}

/** Shows "Show …" while the all-OK agents are folded away, "Hide …" once they're open; no colours. */
const toggleWords = `.worker-agents-ok[open] .show-words, .worker-agents-ok:not([open]) .hide-words { display: none; }`;

function Page({
  page,
  companyPrefix,
}: {
  readonly page: PageData;
  readonly companyPrefix: string | null;
}) {
  const checked = page.checkedAt !== null;
  const attention = checked ? page.agents.filter(needsAttention) : page.agents;
  const allOk = checked ? page.agents.filter((row) => !needsAttention(row)) : [];
  const banners = [checksBanner(page), prDataBanner(page)].filter((text) => text !== undefined);
  return (
    <>
      <p>
        {checked ? (
          <>
            Checked <time dateTime={page.checkedAt ?? ""}>{utcTime(page.checkedAt ?? "")}</time>
          </>
        ) : (
          "No checks yet"
        )}{" "}
        · Failed runs: last 24 hours
      </p>
      <section>
        <h2>Board agents and plugin jobs</h2>
        <ul aria-label="Board agents">
          {page.boardAgents.map((tile) => (
            <BoardAgent key={tile.name} tile={tile} />
          ))}
        </ul>
        <p>
          Plugin jobs and merge speed: <em>Not available yet</em>
        </p>
      </section>
      <section>
        <h2 id="worker-agents-table">Rule checks per agent</h2>
        {banners.map((text) => (
          <p key={text}>
            <strong>{text}</strong>
          </p>
        ))}
        {checked ? null : (
          <div>
            <h3>No checks yet</h3>
            <p>The first board.check pass fills this page. It runs every 10 minutes.</p>
          </div>
        )}
        <p>{checked ? checksSummary(page) : summaryText(page)}</p>
        {attention.length === 0 ? null : (
          <AgentTable
            rows={attention}
            labelledBy="worker-agents-table"
            companyPrefix={companyPrefix}
          />
        )}
        {allOk.length === 0 ? null : (
          // A native disclosure: the toggle needs no script state, so the page stays read-only.
          <details className="worker-agents-ok">
            <style>{toggleWords}</style>
            <summary>
              {allOkText(page, allOk)} ·{" "}
              <span className="show-words">
                {toggleText(allOk.length, attention.length === 0, false)}
              </span>
              <span className="hide-words">
                {toggleText(allOk.length, attention.length === 0, true)}
              </span>
            </summary>
            <AgentTable
              rows={allOk}
              label="Agents with all checks OK"
              companyPrefix={companyPrefix}
            />
          </details>
        )}
      </section>
    </>
  );
}

const headers = [
  "Agent",
  "Now",
  "Failed runs",
  "Open PRs",
  ...ruleNames.map((rule) => ruleHeaders[rule]),
];

function AgentTable({
  rows,
  labelledBy,
  label,
  companyPrefix,
}: {
  readonly rows: readonly WorkerRow[];
  readonly labelledBy?: string;
  readonly label?: string;
  readonly companyPrefix: string | null;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table aria-labelledby={labelledBy} aria-label={label}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AgentRow key={row.name} row={row} companyPrefix={companyPrefix} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardAgent({ tile }: { readonly tile: BoardAgentTile }) {
  return (
    <li>
      <strong>{tile.name}</strong>{" "}
      {tile.paused ? <StatusBadge label="Paused" status="info" /> : null} {runText(tile.lastRun)}
    </li>
  );
}

function AgentRow({
  row,
  companyPrefix,
}: {
  readonly row: WorkerRow;
  readonly companyPrefix: string | null;
}) {
  const more = moreText(row);
  const rowStatus = rowStatusText(row);
  return (
    <tr>
      <th scope="row">
        {row.name}
        {rowStatus === undefined ? null : <div>{rowStatus}</div>}
        {row.paused ? (
          <div>
            <StatusBadge label="Paused" status="info" />
          </div>
        ) : null}
      </th>
      <td>
        {row.current === undefined ? (
          "Nothing in progress"
        ) : (
          <TaskLink identifier={row.current.task} companyPrefix={companyPrefix} />
        )}
        {more === undefined ? null : (
          <>
            <span aria-hidden="true"> +{row.current?.more} more</span>
            <span style={hidden}> {more}</span>
          </>
        )}
        <div>{runText(row.lastRun)}</div>
      </td>
      <td>
        {row.failed.length === 0
          ? "None"
          : row.failed.map(({ cause, runs }) => (
              <div key={cause}>
                <code>{cause}</code> {runs}
                <span style={hidden}> {runs === 1 ? "run" : "runs"}</span>
              </div>
            ))}
      </td>
      <td>
        <em>Not available yet</em>
      </td>
      {ruleNames.map((rule) => (
        <CheckCell
          key={rule}
          agent={row.name}
          rule={rule}
          check={row.checks?.[rule]}
          companyPrefix={companyPrefix}
        />
      ))}
    </tr>
  );
}
