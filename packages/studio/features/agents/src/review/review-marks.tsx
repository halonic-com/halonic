import { ItemChangeMark, type ItemReviewMarks } from "@halonicjs/studio-shell";
import { createContext, type ReactNode, useContext } from "react";
import type { AgentRef } from "../api.ts";
import type { ConfigurationPage } from "../configuration/configuration.tsx";
import type { AgentChangeToReview } from "../review-api.ts";

/** What the agent page's marks read and decide, from the shell's `useItemReview`. */
export interface ReviewMarksValue extends ItemReviewMarks {
  /** The agent the page is for: a subagent's card on it shows no marks. */
  readonly agent: AgentRef;
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
  "workingFolder",
  "allowedSites",
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
 * The mark for the assistant's change to `field` around the field (`children`), as AI changes 1.2
 * has it: the old value struck through, the field as it is now, then Accept and Reject. With no
 * change to `field`, just the field.
 *
 * @example
 * <ReviewMark agent={settings} field="model">
 *   <Field label="Model">…</Field>
 * </ReviewMark>
 */
export function ReviewMark({
  agent,
  field,
  children,
}: {
  readonly agent: AgentRef;
  readonly field: string;
  readonly children: ReactNode;
}) {
  const marks = useMarksFor(agent);
  const change = marks?.review.whole
    ? undefined
    : marks?.review.changes.find((each) => fieldOf(each) === field);
  if (marks === null || change === undefined) return children;
  return (
    <ItemChangeMark marks={marks} change={change}>
      {children}
    </ItemChangeMark>
  );
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
        <ItemChangeMark key={change.id} marks={marks} change={change} />
      ))}
    </div>
  );
}
