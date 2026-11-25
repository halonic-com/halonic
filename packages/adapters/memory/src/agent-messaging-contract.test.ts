// The contract that every transport of `AgentMessaging` passes, run against
// the fake itself, so the contract's own expectations are the fake's.
import { agentMessagingContract } from "@halonicjs/testing-contracts";

agentMessagingContract("the fake itself", async (fake) => fake);
