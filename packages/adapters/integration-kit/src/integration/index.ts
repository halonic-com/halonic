// The integration entry, @halonicjs/adapter-integration-kit/integration,
// published as @halonicjs/adapters/integration-kit: only what integration code
// imports. It brings in no outside code, not even Zod, because it ends up in
// every integration's cloud bundle. The host side (`../index.ts`) imports the
// error classes from here, so there is only one copy of each.

export type {
  ChatMessage,
  ChatParams,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  HttpClient,
  Integration,
  IntegrationConnection,
  IntegrationHost,
  IntegrationHttpClient,
  IntegrationRequestInit,
  IntegrationTool,
  KnowledgeCapabilities,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeProvider,
  LlmCapabilities,
  LlmProvider,
  ProviderConfig,
  ProviderReplay,
  SecretPlacement,
  TokenStore,
  ToolCall,
  ToolDefinition,
  ToolRisk,
} from "@halonicjs/ports";
export { maxIntegrationWaitMs } from "@halonicjs/ports";
export { IntegrationRefusedError, IntegrationTimeoutError, type RefusalCode } from "./refused.ts";
export {
  type ArgumentCheck,
  type ArgumentIssue,
  type ArgumentSchema,
  type ArgumentsOf,
  type MakeError,
  type RunToolCall,
  runTool,
  type ToolCallRefusal,
  type ToolImplementation,
  type ToolResult,
} from "./run-tool.ts";
