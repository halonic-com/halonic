import type { RuntimeHost, ToolResult } from "./host.ts";
import type { WorkerSetup } from "./worker-client.ts";

/** The state key the probe tool uses. */
export const probeKey = {
  scopeKind: "company",
  scopeId: "acme",
  namespace: "probe",
  stateKey: "last",
} as const;

/** The secret reference the probe tool resolves. */
export const probeSecret = { type: "secret_ref", secretId: "acme-read-token" } as const;

/** One call back to Paperclip per kind, by name. */
const probes: Record<
  string,
  (host: RuntimeHost, input: Record<string, unknown>) => Promise<unknown>
> = {
  echo: async (_host, input) => input["text"],
  state: async (host, input) => {
    await host.state.set(probeKey, input["value"]);
    return host.state.get(probeKey);
  },
  "state-delete": async (host) => {
    await host.state.delete(probeKey);
    return host.state.get(probeKey);
  },
  config: (host) => host.config.get("acme"),
  secret: (host) => host.secrets.resolve(probeSecret, { companyId: "acme" }),
  http: async (host, input) => {
    const headers = { authorization: `Bearer ${String(input["token"] ?? "")}` };
    const response = await host.http.fetch("https://api.github.com/zen", { headers });
    return `${response.status} ${await response.text()}`;
  },
  metric: async (host) => {
    await host.metrics.write("probe.calls", 1, { tool: "probe" });
    return "counted";
  },
  agent: (host) => host.agents.get("agent-mateo", "acme"),
  agents: (host) => host.agents.list({ companyId: "acme" }),
  task: async (host) => {
    const task = await host.issues.get("issue-1", "acme");
    const comments = await host.issues.listComments("issue-1", "acme");
    const { blockedBy } = await host.issues.relations.get("issue-1", "acme");
    const documents = await host.issues.documents.list("issue-1", "acme");
    const plan = await host.issues.documents.get("issue-1", "plan", "acme");
    return {
      title: task?.title,
      comments: comments.map((comment) => comment.body),
      blockedBy: blockedBy.length,
      documents: documents.length,
      plan: plan?.body ?? null,
    };
  },
};

/**
 * The setup of a test plugin with one tool, `probe`, that makes the call
 * back its `kind` names, through the host the worker gives the call, and
 * answers with what came back or the error it got.
 */
export const probeSetup: WorkerSetup = (registeredOn) => {
  const declaration = {
    name: "probe",
    displayName: "Probe",
    description: "Probes.",
    parametersSchema: {},
  };
  registeredOn.tools.register(
    "probe",
    declaration,
    async (params, _runCtx, host = registeredOn) => {
      const input = params as Record<string, unknown>;
      const probe = probes[String(input["kind"])];
      if (probe === undefined) return { error: `no probe ${String(input["kind"])}` };
      try {
        return { content: "ok", data: await probe(host, input) } satisfies ToolResult;
      } catch (error) {
        return { error: (error as Error).message };
      }
    },
  );
};
