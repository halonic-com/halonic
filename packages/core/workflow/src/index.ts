/** The npm name of this package. A placeholder export, so the empty package has an API to test. */
export const packageName = "@halonicjs/workflow";

export {
  APPROVAL_EVENTS,
  approvalComment,
  approvalDecision,
  REJECTED_TOOL_RESULT,
  revisedToolResult,
} from "./approvals.ts";
export { evaluateGuard } from "./guards.ts";
export {
  childInput,
  contextBefore,
  promptFor,
  type StateInput,
  withGets,
} from "./inputs.ts";
export {
  acceptedEvents,
  answerLabels,
  dueTimer,
  getState,
  type Scope,
  type StateTimer,
  selectTransition,
  stateTimers,
  type TimerTransition,
} from "./machine.ts";
export { parseDuration } from "./parse-duration.ts";
export {
  getPath,
  type RenderedDescription,
  render,
  renderDescription,
  renderText,
} from "./template.ts";
export { toNumber } from "./to-number.ts";
export { validateWorkflow } from "./validate.ts";
export type {
  Severity,
  ValidateOptions,
  WorkflowIssue,
  WorkflowIssueCode,
} from "./workflow-issue.ts";
