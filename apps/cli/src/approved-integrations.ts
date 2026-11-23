// The local integrations whose sheets a run may take declared tools from
// (requirement `workspace.declared-tools`): only when a trust check passed.
// It lives in the workspace engine, whose watch starts runs with it (HAL-17054).

export { approvedIntegrations } from "@halonicjs/adapter-workspace-engine-node";
