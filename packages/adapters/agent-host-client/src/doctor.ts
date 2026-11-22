import type {
  AnyDoctorLine,
  DoctorAction,
  DoctorLineId,
  DoctorStatus,
  DoctorSummary,
} from "@halonicjs/app";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/** The lines the host answers; the page builds the others itself. */
const answeredLines = [
  "workspace",
  "models",
  "sandbox",
  "harnesses",
  "network",
  "disk",
] as const satisfies readonly DoctorLineId[];

const statuses = ["ok", "warning", "failed"] as const satisfies readonly DoctorStatus[];

const actions = [
  "review-trust",
  "open-models",
  "test-again",
  "pick-model",
  "open-run",
] as const satisfies readonly DoctorAction[];

/** The kinds of sandbox the host names on a ready Sandbox line (`agent-host.doctor-sandbox-kind`). */
const sandboxKinds = ["bubblewrap", "seatbelt", "windows"] as const;

/**
 * A line: its id, its mark, its actions and a ready sandbox's kind checked; its facts are the
 * engine's types and pass as they are.
 */
const lineSchema = s
  .object({
    check: s.enum(answeredLines),
    status: s.enum(statuses),
    actions: s.array(s.enum(actions)),
    sandboxKind: s.enum(sandboxKinds).optional(),
  })
  .passthrough();

const answerSchema = s
  .object({
    checks: s.array(lineSchema),
    summary: s
      .object({
        problems: s.number().int().min(0),
        warnings: s.number().int().min(0),
        needsFixing: s.boolean(),
      })
      .strict(),
  })
  .strict();

/**
 * One line the host answered: the doctor's facts and the actions the page may offer on it. A ready
 * Sandbox line also names the kind of sandbox the host runs, which only the host knows on Windows.
 */
export type HostDoctorLine = AnyDoctorLine & {
  readonly actions: DoctorAction[];
  readonly sandboxKind?: (typeof sandboxKinds)[number];
};

/** The host's checks of this computer: the lines it can answer for, and their counts. */
export interface HostDoctorReport {
  readonly checks: readonly HostDoctorLine[];
  readonly summary: DoctorSummary;
}

/**
 * The page's way to run the checks of "Check this computer" that need Node
 * (HAL-13407), on the agent host: `halonic doctor`'s Workspace, Models,
 * Sandbox, Harnesses, Network and Disk lines, as facts and ids. The page
 * words them, and adds the key lines, Default model and Last run itself.
 */
export class AgentHostDoctor {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Checks this computer, and the workspace in `workspace` when given.
   *
   * @param workspace - the workspace folder, one the host was started for; left out, only the computer is checked
   * @throws {@link AgentHostError} `busy` while another check runs, `unknown_workspace`,
   *   `no_workspace`, `doctor_failed`, `answer_invalid` for an answer of another shape,
   *   or when the host can't be reached
   */
  async doctor(workspace?: string): Promise<HostDoctorReport> {
    const route = "POST /v1/doctor";
    const answer = await this.#transport.request(
      route,
      workspace === undefined ? {} : { workspace },
    );
    // The schema checks the ids, marks and actions; each line's facts are the engine's own types.
    return readAnswer(route, answer, answerSchema) as unknown as HostDoctorReport;
  }
}
