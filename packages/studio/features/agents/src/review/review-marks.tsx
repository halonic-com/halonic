import { ChangeMark, type ChangeMarkBusy, type ChangeMarkKind } from "@halonicjs/studio-shell";
import { createContext, useContext } from "react";
import type { AgentRef } from "../api.ts";
import type { ConfigurationPage } from "../configuration/configuration.tsx";
import type { AgentChangeToReview, AgentReview } from "../review-api.ts";

/** What the agent page's marks read and decide, from {@link useAgentReview}. */
export interface ReviewMarksValue {
  /** The agent the page is for: a subagent's card on it shows no marks. */
  readonly agent: AgentRef;
  readonly review: AgentReview;
  readonly decide: (change: AgentChangeToReview, verb: ChangeMarkBusy) => void;
  /** The change whose Accept or Reject is running. */
  readonly busy?: { readonly id: string; readonly verb: ChangeMarkBusy } | undefined;
  /** The file changed outside Halonic, so the decisions wait for Compare (review panel note 4). */
  readonly held: boolean;
}

/** The agent page's changes to review, for the marks on its Configuration pages. */
export const ReviewMarksContext = createContext<ReviewMarksValue | null>(null);

/** The Configuration page each field of the agent's file is on; agent steps are `methods`. */
const fieldPages: Readonly<Record<string, ConfigurationPage>> = {
  name: "behaviour",
  description: "behaviour",
  instructions: "behaviour",
  output: "behaviour",
  model: "model",
  maxSteps: "model",
  params: "model",
  harness: "harness",
  workingFolder: "harness",
  allowedSites: "harness",
  asks: "harness",
  harnessLimits: "harness",
  skills: "tools",
  knowledge: "tools",
  connectors: "tools",
  collections: "tools",
  subagents: "subagents",
  methods: "agentSteps",
};

/**
 * The fields a page marks where it draws them, with {@link ReviewMark}. Any other change is marked
 * at the top of its page, by {@link PageMarks}.
 */
const placedFields: ReadonlySet<string> = new Set([
  "description",
  "instructions",
  "output",
  "model",
  "maxSteps",
  "params",
  "harness",
]);

const fieldOf = (change: AgentChangeToReview): string | undefined => change.parts[0]?.[0];

/** The Configuration page a change is marked on: a change to the whole file is on Behaviour. */
export function pageOfChange(change: AgentChangeToReview): ConfigurationPage {
  const field = fieldOf(change);
  return (field === undefined ? undefined : fieldPages[field]) ?? "behaviour";
}

/** The page's changes to review when `agent` is the page's own agent. */
function useMarksFor(agent: AgentRef): ReviewMarksValue | null {
  const marks = useContext(ReviewMarksContext);
  const own = marks !== null && marks.agent.hubId === agent.hubId && marks.agent.id === agent.id;
  return own ? marks : null;
}

/**
 * The mark for the assistant's change to `field`, if it changed it, put just above the field.
 *
 * @example
 * <ReviewMark agent={settings} field="model" />
 */
export function ReviewMark({ agent, field }: { readonly agent: AgentRef; readonly field: string }) {
  const marks = useMarksFor(agent);
  const change = marks?.review.whole
    ? undefined
    : marks?.review.changes.find((each) => fieldOf(each) === field);
  if (marks === null || change === undefined) return null;
  return <Mark marks={marks} change={change} />;
}

/**
 * The marks at the top of `page` for its changes no field there marks: a field the page doesn't
 * draw on its own, such as the name, an agent step, or a change to the whole file.
 */
export function PageMarks({
  agent,
  page,
}: {
  readonly agent: AgentRef;
  readonly page: ConfigurationPage;
}) {
  const marks = useMarksFor(agent);
  if (marks === null) return null;
  const { review } = marks;
  const loose = review.changes.filter(
    (change) =>
      pageOfChange(change) === page && (review.whole || !placedFields.has(fieldOf(change) ?? "")),
  );
  if (loose.length === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-4">
      {loose.map((change) => (
        <Mark key={change.id} marks={marks} change={change} />
      ))}
    </div>
  );
}

function Mark({
  marks,
  change,
}: {
  readonly marks: ReviewMarksValue;
  readonly change: AgentChangeToReview;
}) {
  const { review, decide, busy, held } = marks;
  return (
    <ChangeMark
      id={change.id}
      sentence={change.sentence}
      kind={kindOf(review, change)}
      important={change.important}
      before={shownValue(change.before?.value)}
      onAccept={() => decide(change, "accept")}
      onReject={() => decide(change, "reject")}
      deletesFile={review.created}
      busy={busy?.id === change.id ? busy.verb : undefined}
      waiting={held}
    />
  );
}

function kindOf(review: AgentReview, change: AgentChangeToReview): ChangeMarkKind {
  if (review.created) return "added";
  return change.before === undefined && !review.whole ? "added" : "changed";
}

/** The old value as the mark strikes it through; a value with no short text shows none. */
function shownValue(value: unknown): string | undefined {
  if (value === "") return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((each) => typeof each === "string")) {
    return value.join(", ");
  }
  return undefined;
}
