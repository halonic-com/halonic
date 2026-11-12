import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A made-up key in Anthropic's format, as a user might paste it where the secret's name goes. */
export const pastedKey = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;

/**
 * Moves a copy of the Acme example onto Anthropic as a user might on their
 * first real model, but with the key pasted into the provider file:
 * `halonic validate` refuses that file (`secret-looks-like-key`), so
 * `loadWorkspace` leaves it out (HAL-6613).
 */
export async function pasteKeyIntoProvider(acme: string): Promise<void> {
  await writeFile(
    join(acme, "providers/anthropic.yaml"),
    `id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: ${pastedKey}\n`,
  );
  await appendFile(
    join(acme, "models.yaml"),
    "  smart:\n    provider: anthropic\n    model: claude-sonnet-5-5\n",
  );
  await appendFile(join(acme, "hubs/support/agents/writer.agent.yaml"), "model: smart\n");
}
