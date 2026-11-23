import {
  type PluginPageProps,
  Spinner,
  StatusBadge,
  usePluginData,
} from "@paperclipai/plugin-sdk/ui";
import { workerAgentsDataKey } from "../keys.ts";
import type { BoardAgentTile, WorkerAgentsPage as PageData, WorkerRow } from "../page.ts";
import { loadErrorCause, moreText, runText, summaryText, taskHref, utcTime } from "./view.ts";

/**
 * The board's "Worker agents" page (addendum 2 on HAL-15997): the board
 * agents, then one row per worker agent. Read-only: its only call is the
 * page's data, and "Try again" reads it again. A plain table instead of the
 * SDK's `DataTable`, for row headers (HAL-16208, section 3.7). It sets no
 * colours of its own, so the host's light and dark themes apply.
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

function Page({
  page,
  companyPrefix,
}: {
  readonly page: PageData;
  readonly companyPrefix: string | null;
}) {
  return (
    <>
      <p>
        Checked <time dateTime={page.at}>{utcTime(page.at)}</time> · Failed runs: last 24 hours
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
        <p>{summaryText(page)}</p>
        <div style={{ overflowX: "auto" }}>
          <table aria-labelledby="worker-agents-table">
            <thead>
              <tr>
                {["Agent", "Now", "Failed runs", "Open PRs", "Branch names"].map((header) => (
                  <th key={header} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.agents.map((row) => (
                <AgentRow key={row.name} row={row} companyPrefix={companyPrefix} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
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

const hidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const;

function AgentRow({
  row,
  companyPrefix,
}: {
  readonly row: WorkerRow;
  readonly companyPrefix: string | null;
}) {
  const more = moreText(row);
  return (
    <tr>
      <th scope="row">
        {row.name}
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
      <td>
        <em>Not available yet</em>
      </td>
    </tr>
  );
}

function TaskLink({
  identifier,
  companyPrefix,
}: {
  readonly identifier: string;
  readonly companyPrefix: string | null;
}) {
  const href = taskHref(companyPrefix, identifier);
  return href === undefined ? <span>{identifier}</span> : <a href={href}>{identifier}</a>;
}
