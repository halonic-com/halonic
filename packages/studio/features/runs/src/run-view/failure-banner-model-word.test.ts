import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, context, failed, failedEvent, lines } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";

verifies("runs.run-view.failure-banners", () => {
  it("writes a missing Ollama model's name for a shell in the command to copy and in the line", () => {
    const model = "llama3.2; echo $HOME";
    const banner = causeBanner(
      failed("model-missing"),
      [call("ollama", model), failedEvent()],
      context,
      false,
    );
    expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([
      { kind: "copy-command", command: 'ollama pull "llama3.2; echo \\$HOME"' },
    ]);
    expect(lines(banner)?.[0]).toContain('Run ollama pull "llama3.2; echo \\$HOME" in a terminal');
    const onPhone = causeBanner(
      failed("model-missing"),
      [call("ollama", model), failedEvent()],
      context,
      true,
    );
    expect(lines(onPhone)?.[0]).toContain('Run ollama pull "llama3.2; echo \\$HOME" in a terminal');
  });

  it("leaves a model's name as it is when a shell reads it as one word", () => {
    const banner = causeBanner(
      failed("model-missing"),
      [call("ollama", "qwen2.5:7b"), failedEvent()],
      context,
      false,
    );
    expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([
      { kind: "copy-command", command: "ollama pull qwen2.5:7b" },
    ]);
  });
});
