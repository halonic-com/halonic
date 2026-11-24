// The public API of @halonicjs/toolscript. Everything else in src/ is internal.

export { type Artifact, artifactSchema, maxArtifactCodeLength } from "./artifact.ts";
export { checkHeader, type HeaderCheck, type HeaderCheckContext } from "./check-header.ts";
export type {
  AgentContext,
  CapabilityEntry,
  CapabilityRegistry,
  HeaderShape,
  InputsOf,
  SecretHandle,
  UsedCapabilities,
  UserContext,
} from "./context.ts";
export { type Header, headerSchema, toolscriptFormat } from "./header.ts";
export { maxAgentCalls, toolscriptRisks } from "./header-parts.ts";
export { type InputField, inputFieldSchema } from "./input-fields.ts";
export { type HeaderUi, uiComponents, uiSchema } from "./ui.ts";
