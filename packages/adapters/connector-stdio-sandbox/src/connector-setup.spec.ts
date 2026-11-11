import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorFactoryContext, SandboxFence, SandboxProfile } from "@halonicjs/ports";
import {
  contractGrant,
  type FakeProgram,
  FakeSandboxSession,
  type ReachedCall,
} from "@halonicjs/testing-contracts";
import { contractProgram, scriptConfig, testPlace, testProfile } from "./fake-mcp-program.spec.ts";
import {
  type ConnectorBlock,
  SandboxStdioConnectorFactory,
  type SandboxStdioOptions,
} from "./sandbox-connector.ts";

export interface SetUpOptions {
  readonly program?: FakeProgram;
  readonly fence?: SandboxFence;
  /** The session's profile; the one Halonic builds for {@link scriptConfig} unless given. */
  readonly profile?: SandboxProfile;
  readonly factory?: Partial<SandboxStdioOptions>;
}

/**
 * A sandboxed connector factory, a fake session running the contract's
 * server unless given another program, and a trusted context with it.
 */
export function setUp(options: SetUpOptions = {}) {
  const reached: ReachedCall[] = [];
  const sandbox = new FakeSandboxSession({
    profile: options.profile ?? testProfile,
    program: options.program ?? contractProgram(reached),
    ...(options.fence === undefined ? {} : { fence: options.fence }),
  });
  const blocked: ConnectorBlock[] = [];
  const factory = new SandboxStdioConnectorFactory({
    clientInfo: { name: "halonic", version: "0.1.0" },
    onBlocked: (block) => blocked.push(block),
    localTools: () => ({ place: testPlace }),
    ...options.factory,
  });
  const context: ConnectorFactoryContext = {
    secrets: new MemorySecrets(),
    tokens: new MemoryTokenStore(),
    http: { fetch: () => Promise.reject(new Error("a local tool reaches no network here")) },
    trust: contractGrant,
    sandbox,
  };
  return { sandbox, factory, context, reached, blocked };
}

/** The connector config of a script local tool, as the tests start it. */
export const config = scriptConfig;
