/**
 * The tools whose approval is `normal`: they only read what is already inside
 * the sandbox. The names are those the harnesses report in `approval.requested`.
 */
const readOnlyTools: ReadonlySet<string> = new Set(["Read", "Glob", "Grep", "LS", "NotebookRead"]);

/**
 * How risky an approval is, as the host judges it from the tool the agent
 * wants to call, never from anything the phone or the tool's server says.
 *
 * Fails closed: a tool counts as `normal` only when it is known to only read
 * inside the sandbox. A shell command, a file write, anything that reads a
 * secret or leaves the sandbox, and any tool the host doesn't know, is
 * `risky`, and a phone may answer it only when the person allowed that on
 * this host's desktop.
 */
export function judgeApprovalRisk(tool: string): "normal" | "risky" {
  return readOnlyTools.has(tool) ? "normal" : "risky";
}
