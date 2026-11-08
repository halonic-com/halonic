/** The npm name of this package. A placeholder export, so the empty package has an API to test. */
export const packageName = "@halonicjs/workflow";

export {
  APPROVAL_EVENTS,
  approvalComment,
  approvalDecision,
  REJECTED_TOOL_RESULT,
  revisedToolResult,
} from "./approvals.ts";
export { parseDuration } from "./parse-duration.ts";
export { getPath, render, renderText } from "./template.ts";
export { toNumber } from "./to-number.ts";
