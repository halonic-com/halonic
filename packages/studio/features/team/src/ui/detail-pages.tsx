import type { MessagingId, SpendRange } from "@halonicjs/ports";
import { Button, Card, ChevronRightIcon, ListHeading } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useState } from "react";
import { teamDetailWords as words } from "../team-detail-words.ts";
import {
  type AgentLine,
  type AgentsBySpend,
  agentsBySpendShown,
  type TeamDetails,
} from "../team-details.ts";
import { formatDayTime, formatMoney, formatTime, formatTokens } from "../team-format.ts";
import { teamWords } from "../team-words.ts";
import { LoadingBody, PageFrame, TryAgain } from "./page-frame.tsx";
import { UsageMeter } from "./usage-meter.tsx";

/** A page the Team place can show over Spend and seats. */
export type TeamPage =
  | { kind: "agent"; id: MessagingId }
  | { kind: "seat"; id: MessagingId }
  | { kind: "agents" };

/** The `data-opens` key of the row that opens `page`, so Back can focus that row again. */
export function pageKey(page: TeamPage): string {
  return page.kind === "agents" ? "agents" : `${page.kind}:${page.id}`;
}

/** What a detail page holds while it reads: still loading, the answer, or a failed read. */
type Read<Value> = { kind: "loading" } | { kind: "read"; value: Value } | { kind: "failed" };

/** Reads once, again whenever a source says it changed, and on Try again. */
function useDetail<Value>(details: TeamDetails, read: () => Promise<Value>, key: string) {
  const [shown, setShown] = useState<Read<Value>>({ kind: "loading" });
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);
  useEffect(() => details.watch(readAgain), [details]);
  // `read` is a new function each render; `key` says what it reads, so the effect reruns on that.
  useEffect(() => {
    let current = true;
    read().then(
      (value) => current && setShown({ kind: "read", value }),
      (error: unknown) => {
        console.error("A Team detail page couldn't be read:", error);
        if (current) setShown({ kind: "failed" });
      },
    );
    return () => {
      current = false;
    };
  }, [details, key, changed]);
  return { shown, readAgain };
}

/** Opening a detail page focuses its h1, since the page replaces the one whose row was pressed. */
const opened = { kind: "heading" } as const;

/**
 * The frame of a detail page: Back, then the page, or why there is none. One frame for every
 * state, so the main and h1 stay the same elements when the read lands.
 */
function DetailFrame<Value>(props: {
  shown: Read<Value | undefined>;
  onBack: () => void;
  onTryAgain: () => void;
  children: (value: Value) => ReactNode;
}) {
  const { shown } = props;
  const loading = shown.kind === "loading";
  return (
    <PageFrame busy={loading} freshness={loading ? teamWords.loading : undefined} arrival={opened}>
      <Button variant="secondary" size="sm" onClick={props.onBack}>
        {words.back}
      </Button>
      {loading ? <LoadingBody /> : null}
      {shown.kind === "failed" ? <TryAgain onPress={props.onTryAgain} /> : null}
      {shown.kind === "read" && shown.value === undefined ? <p>{words.notFound}</p> : null}
      {shown.kind === "read" && shown.value !== undefined ? props.children(shown.value) : null}
    </PageFrame>
  );
}

/** An agent's name, status word and task, as one line. */
function agentWords(agent: AgentLine): string {
  const parts = [agent.name ?? words.unknownAgent];
  if (agent.activity !== undefined) parts.push(words.activity[agent.activity]);
  if (agent.work !== undefined) parts.push(agent.work.label);
  return parts.join(" · ");
}

/** A row that opens a page, with › at its end. */
function OpenRow(props: { onOpen: () => void; children: ReactNode }) {
  return (
    <Card onClick={props.onOpen}>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 wrap-anywhere">{props.children}</span>
        <span aria-hidden="true" className="inline-grid size-icon-sm text-fg-muted *:size-full">
          <ChevronRightIcon />
        </span>
      </span>
    </Card>
  );
}

/** Agents by spend: each agent with what it paid and its tokens today; a row opens the agent. */
export function AgentsBySpendList(props: {
  bySpend: AgentsBySpend;
  onOpen: (page: TeamPage) => void;
}) {
  const { rows, total } = props.bySpend;
  if (total === 0) return null;
  return (
    <section aria-label={words.agentsBySpend} className="flex flex-col gap-2">
      <ListHeading name={words.agentsBySpend} />
      <ul className="flex flex-col gap-2">
        {rows.map(({ agent, spend }) => (
          <li key={agent.id} data-opens={pageKey({ kind: "agent", id: agent.id })}>
            <OpenRow onOpen={() => props.onOpen({ kind: "agent", id: agent.id })}>
              {`${agent.name ?? words.unknownAgent} · ${formatMoney(spend.paid)} · ${formatTokens(spend.tokens.input + spend.tokens.cached + spend.tokens.output)}`}
            </OpenRow>
          </li>
        ))}
      </ul>
      {rows.length < total ? (
        <div data-opens={pageKey({ kind: "agents" })} className="flex flex-col">
          <Button variant="secondary" size="sm" onClick={() => props.onOpen({ kind: "agents" })}>
            {words.seeAll(total)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Every agent that spent today, for **See all**. */
export function AllAgentsPage(props: {
  details: TeamDetails;
  onOpen: (page: TeamPage) => void;
  onBack: () => void;
}) {
  const { details } = props;
  const { shown, readAgain } = useDetail(details, () => details.agentsBySpend(), "all");
  return (
    <DetailFrame shown={shown} onBack={props.onBack} onTryAgain={readAgain}>
      {(bySpend) => <AgentsBySpendList bySpend={bySpend} onOpen={props.onOpen} />}
    </DetailFrame>
  );
}

const ranges: readonly SpendRange[] = ["today", "week", "month"];

/** One agent (flows 1.3): its status and task, money by range, its seat and tokens by model. */
export function AgentDetailPage(props: {
  details: TeamDetails;
  id: MessagingId;
  onBack: () => void;
}) {
  const { details, id } = props;
  const { shown, readAgain } = useDetail(details, () => details.agent(id), id);
  return (
    <DetailFrame shown={shown} onBack={props.onBack} onTryAgain={readAgain}>
      {({ agent, spend, seat }) => (
        <>
          <h2 className="text-heading">{agentWords(agent)}</h2>
          {agent.work === undefined ? null : <p>{words.worksOn(agent.work.label)}</p>}
          <dl className="flex gap-6 phone:flex-col">
            {ranges.map((range) => {
              const answer = spend[range];
              if (answer === undefined) return null;
              const budget = range === "month" ? answer.budget : undefined;
              return (
                <div key={range}>
                  <dt className="text-small text-fg-muted">{words[range]}</dt>
                  <dd>
                    {formatMoney(answer.paid)}
                    {budget === undefined || budget.cents === 0
                      ? null
                      : ` ${words.ofBudget(formatMoney(budget), Math.round((answer.paid.cents / budget.cents) * 100))}`}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p>{seat === undefined ? words.noSeat : words.onSeat(seat.label)}</p>
          {spend.week === undefined || spend.week.tokensByModel.length === 0 ? null : (
            <section aria-label={words.tokensByModel} className="flex flex-col gap-1">
              <ListHeading name={words.tokensByModel} />
              {spend.week.tokensByModel.map(({ model, tokens }) => (
                <p key={model} className="tabular-nums">
                  {`${model}  ${words.tokens(formatTokens(tokens.input), formatTokens(tokens.cached), formatTokens(tokens.output))}`}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </DetailFrame>
  );
}

/** One seat (flows 1.4): its windows, manual reset, agents and the Seat Supervisor's proposal. */
export function SeatDetailPage(props: {
  details: TeamDetails;
  id: MessagingId;
  onOpen: (page: TeamPage) => void;
  onBack: () => void;
}) {
  const { details, id } = props;
  const clock = details.timeClock;
  const { shown, readAgain } = useDetail(details, () => details.seat(id), id);
  return (
    <DetailFrame shown={shown} onBack={props.onBack} onTryAgain={readAgain}>
      {({ seat, agents }) => (
        <>
          <h2 className="text-heading">{seat.label}</h2>
          <ul className="flex flex-col gap-2">
            {seat.windows.map((window) => (
              <li
                key={`${window.kind}-${window.label}`}
                className="grid grid-cols-[8rem_1fr] gap-2"
              >
                <span>{window.label}</span>
                <span className="flex flex-col">
                  <UsageMeter percent={window.usedPercent} />
                  <span className="text-small text-fg-muted">
                    {[
                      window.resetsAt && words.resets(formatDayTime(window.resetsAt, clock)),
                      window.reaches90At && words.reaches90(formatTime(window.reaches90At, clock)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p>{words.manualReset(seat.manualReset, (at) => formatDayTime(at, clock))}</p>
          <section
            aria-label={words.agentsOnSeat(seat.label, agents.length)}
            className="flex flex-col gap-2"
          >
            <ListHeading name={words.agentsOnSeat(seat.label, agents.length)} />
            <ul className="flex flex-col gap-2">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <OpenRow onOpen={() => props.onOpen({ kind: "agent", id: agent.id })}>
                    {agentWords(agent)}
                  </OpenRow>
                </li>
              ))}
            </ul>
          </section>
          {seat.proposal === undefined ? null : (
            <section aria-label={words.proposes} className="flex flex-col gap-1">
              <ListHeading
                name={words.proposes}
                detail={words.proposedAt(formatTime(seat.proposal.at, clock))}
              />
              <p>{seat.proposal.text}</p>
            </section>
          )}
        </>
      )}
    </DetailFrame>
  );
}

/** Agents by spend today on Spend and seats: the top 5, with **See all**. Nothing while it reads. */
export function AgentsBySpendSection(props: {
  details: TeamDetails;
  onOpen: (page: TeamPage) => void;
}) {
  const { details } = props;
  const { shown } = useDetail(details, () => details.agentsBySpend(agentsBySpendShown), "top");
  if (shown.kind !== "read") return null;
  return <AgentsBySpendList bySpend={shown.value} onOpen={props.onOpen} />;
}
