import type { ChatRequest, ChatResponse } from "@halonicjs/ports";
import { llmProviderContract } from "@halonicjs/testing-contracts";
import { MockLlmProvider } from "./mock-provider.ts";
import type { MockReply } from "./script.ts";

/** The mock, counting the calls it hasn't settled yet so the suite can check none is left open. */
class CountedMock extends MockLlmProvider {
  open = 0;

  override async chat(request: ChatRequest): Promise<ChatResponse> {
    this.open += 1;
    try {
      return await super.chat(request);
    } finally {
      this.open -= 1;
    }
  }
}

// The suite scripts each call after the provider is made, so the replies
// come from the fallback, one scripted reply per call.
llmProviderContract(
  "model-mock",
  async () => {
    const replies: MockReply[] = [];
    const provider = new CountedMock("mock", {}, () => replies.shift() ?? "");
    return {
      provider,
      answerNext: (answer) => replies.push(answer),
      hangNext: () => replies.push({ hang: true }),
      refuseNext: () => replies.push({ refuse: "The scripted vendor refused the call." }),
      calls: () => ({ started: provider.requests.length, open: provider.open }),
    };
  },
  // A whole scripted answer can hold a reasoning summary. The mock doesn't stream.
  { streams: false, reasoning: true },
);
