import type { RequestLogLine } from "@halonicjs/app";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const linesAnswer = s.object({ lines: s.array(s.unknown()) }).strict();

/**
 * The local request logs of one workspace's integrations, which the CLI's
 * engine keeps in the person's profile, read through the agent host: a page
 * can't read files (`agent-host.request-log-routes`). Every read names the
 * window's own workspace, so a log of another workspace with the same
 * integration id is never read.
 *
 * @example
 * const logs = new AgentHostRequestLogs(transport, "/work/acme");
 * await logs.lines("notes");
 */
export class AgentHostRequestLogs {
  readonly #transport: AgentHostTransport;
  readonly #location: string;

  /** @param location - the window's workspace, by its real path */
  constructor(transport: AgentHostTransport, location: string) {
    this.#transport = transport;
    this.#location = location;
  }

  /**
   * The integration's log, oldest first. A line that isn't a request or a failure note is left
   * out; the rest is read as untrusted text, as the file is.
   *
   * @throws {@link AgentHostError} `unknown_workspace` or `request_log_unreadable` when the host refuses
   */
  async lines(integration: string): Promise<RequestLogLine[]> {
    const route = "POST /v1/integration-logs/read";
    const answer = await this.#transport.request(route, { location: this.#location, integration });
    return readAnswer(route, answer, linesAnswer).lines.filter(isLogLine);
  }
}

function isLogLine(line: unknown): line is RequestLogLine {
  const type = (line as { type?: unknown } | null)?.type;
  return type === "request" || type === "failure";
}
