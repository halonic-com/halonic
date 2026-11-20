/**
 * Why a part of a connector offers no tools in a run (requirement
 * `events.connector-part-off`):
 *
 * - `needs-desktop-app`: the part is a program that runs only in the
 *   Halonic desktop app.
 * - `sandbox-unavailable`: the sandbox can't start on this computer.
 * - `sandbox-not-fenced`: the sandbox starts but can't fence the program in.
 * - `network-needs-srt`: the program reaches the network, which only the
 *   SRT sandbox can limit to its sites.
 * - `settings-not-set`: a required setting of the part has no value.
 * - `not-trusted`: the person's trust doesn't cover the part as it is now.
 * - `failed`: anything else.
 */
export type ConnectorPartOffReason =
  | "needs-desktop-app"
  | "sandbox-unavailable"
  | "sandbox-not-fenced"
  | "network-needs-srt"
  | "settings-not-set"
  | "not-trusted"
  | "failed";

/**
 * One part of a connector, such as a plugin's backend or one of its local
 * tools, offers no tools in this run while the connector's other parts do
 * (requirement `events.connector-part-off`). `connector`: its id in the
 * workspace. `part`: `backend`, or `local:` and the local tool's name, cut
 * to `maxCauseNameLength`. `reason`: a code only, never the error's text.
 */
export interface ConnectorPartOffEvent {
  type: "connector.part-off";
  agent: string;
  connector: string;
  part: string;
  reason: ConnectorPartOffReason;
}
