import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

/** A remote MCP server over HTTP. */
const HttpTransport = s
  .object({
    http: s
      .object({ url: s.string().url(), headers: s.record(s.string(), s.string()).optional() })
      .strict(),
  })
  .strict();

/** A local MCP program over standard input and output. */
const StdioTransport = s
  .object({
    stdio: s
      .object({
        command: s.string().min(1),
        args: s.array(s.string()).default([]),
        /** Plain environment variables; secrets go in `secretEnv`. */
        env: s.record(s.string(), s.string()).optional(),
        /** Environment variable → secret name. */
        secretEnv: s.record(s.string(), s.string()).optional(),
        /** Working directory, relative to the workspace root. */
        cwd: s.string().optional(),
      })
      .strict(),
  })
  .strict();

/** Built-in Gmail and Google Drive for one Google account. */
const GoogleTransport = s
  .object({
    google: s
      .object({
        /** The Google account the connector acts as. */
        account: s.string().email(),
        /**
         * Kept so older files still read. It names no secret: the OAuth
         * client's ID and secret come from the account's Google setup, which
         * only the host's setup routes write (`@halonicjs/google-setup`).
         */
        client: s.string().default("google"),
      })
      .strict(),
  })
  .strict();

/** The `tools.approve` value that makes every tool of the connector ask a person first. */
export const approveAll = "all";

/**
 * `library/connectors/<id>.connector.yaml`: tools for agents from an MCP
 * server or a built-in service. Secrets are referenced by name only.
 */
export const Connector = s
  .object({
    version,
    id,
    name: s.string().optional(),
    description: s.string().optional(),
    transport: s.union([HttpTransport, StdioTransport, GoogleTransport]),
    /** HTTP: the secret sent as a bearer token. Google: the secret with the refresh token. */
    secret: s.string().optional(),
    tools: s
      .object({
        /** Only these tools are offered to agents. Leave out to offer every tool. */
        allow: s.array(s.string()).optional(),
        /**
         * Every call to these tools waits for a person to approve or reject
         * it. `all` means every tool the server offers, including tools it
         * adds later: a new MCP connector starts with it.
         */
        approve: s.union([s.array(s.string()), s.literal(approveAll)]).default([]),
      })
      .strict()
      .default({ approve: [] }),
    /** Runs on this machine or your own network. Default: true for stdio and localhost URLs. */
    local: s.boolean().optional(),
  })
  .strict();

/** A connector, with defaults filled in. */
export type Connector = Infer<typeof Connector>;

/**
 * Whether every call to `tool` waits for a person, as the connector's
 * `tools.approve` says: the tool is listed there, or it says `all`.
 * `tool` is the name the server lists the tool under.
 *
 * @example
 * needsApproval({ approve: "all" }, "delete_file"); // true
 * needsApproval({ approve: ["send_mail"] }, "read_mail"); // false
 */
export function needsApproval(tools: Pick<Connector["tools"], "approve">, tool: string): boolean {
  return tools.approve === approveAll || tools.approve.includes(tool);
}
