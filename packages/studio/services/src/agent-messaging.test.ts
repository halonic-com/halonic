import { describe, expect, it } from "vitest";
import { AgentMessagingService } from "./agent-messaging.ts";
import { AgentMessagingService as fromIndex } from "./index.ts";

describe("AgentMessagingService", () => {
  it("is one key, the same from the package's entry point", () => {
    expect(fromIndex).toBe(AgentMessagingService);
    expect(AgentMessagingService.name).toBe("agent-messaging");
  });
});
