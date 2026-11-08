import { blobStoreVersion } from "./blob-store.ts";
import { clockVersion } from "./clock.ts";
import { connectorClientVersion } from "./connector-client.ts";
import { coordinationVersion } from "./coordination.ts";
import { definitionStoreVersion } from "./definition-store.ts";
import { httpClientVersion } from "./http-client.ts";
import { idGeneratorVersion } from "./id-generator.ts";
import { integrationVersion } from "./integration.ts";
import { knowledgeProviderVersion } from "./knowledge-provider.ts";
import { llmCacheVersion } from "./llm-cache.ts";
import { llmProviderVersion } from "./llm-provider.ts";
import { passwordHasherVersion } from "./password-hasher.ts";
import { recordStoreVersion } from "./record-store.ts";
import { runExecutorVersion } from "./run-executor.ts";
import { runStoreVersion } from "./run-store.ts";
import { schedulerVersion } from "./scheduler.ts";
import { secretsVersion } from "./secrets.ts";
import { tokenStoreVersion } from "./token-store.ts";
import { trustStoreVersion } from "./trust-store.ts";
import { vcsVersion } from "./vcs.ts";

/**
 * Every port and its current version, by port name. Adapters and contract
 * suites can record which version they were written against; the README
 * table is checked against this list.
 *
 * @example
 * if (portVersions.RunStore !== 1) throw new Error("this adapter implements RunStore 1");
 */
export const portVersions = {
  BlobStore: blobStoreVersion,
  Clock: clockVersion,
  ConnectorClient: connectorClientVersion,
  Coordination: coordinationVersion,
  DefinitionStore: definitionStoreVersion,
  HttpClient: httpClientVersion,
  IdGenerator: idGeneratorVersion,
  Integration: integrationVersion,
  KnowledgeProvider: knowledgeProviderVersion,
  LlmCache: llmCacheVersion,
  LlmProvider: llmProviderVersion,
  PasswordHasher: passwordHasherVersion,
  RecordStore: recordStoreVersion,
  RunExecutor: runExecutorVersion,
  RunStore: runStoreVersion,
  Scheduler: schedulerVersion,
  Secrets: secretsVersion,
  TokenStore: tokenStoreVersion,
  TrustStore: trustStoreVersion,
  Vcs: vcsVersion,
} as const;

/** The name of a port, such as "RunStore". */
export type PortName = keyof typeof portVersions;
