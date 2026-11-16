/**
 * How risky an approval is, as the host judges it from the tool the agent
 * wants to call, never from anything the phone or the tool's server says.
 *
 * Fails closed: every tool is `risky` for now. Even a read can leave the
 * working folder (Claude Code asks about `Read` exactly when the path is
 * outside it), and for a run outside Halonic's fence nothing keeps that read
 * from a secret. A tool becomes `normal` only once the host knows the run is
 * inside the fence and the tool only reads inside it. A phone may answer a
 * `risky` approval only when the person allowed that on this host's desktop.
 */
export function judgeApprovalRisk(_tool: string): "normal" | "risky" {
  return "risky";
}
