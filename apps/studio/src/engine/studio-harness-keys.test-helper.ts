// Acme's files and keychain for the Studio's harness key tests.

/** Z.ai's Anthropic-compatible address. */
export const zaiAddress = "https://api.z.ai/api/anthropic";

/** Acme's support hub, whose coder runs in Claude Code, with Z.ai's provider and the `open-coder-agent` alias. */
export const acmeWithOpenCoder: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
  "hubs/support/agents/coder.agent.yaml":
    "id: coder\nname: Coder\nharness: claude-code\nmodel: open-coder-agent\n",
  "providers/zai.yaml": `id: zai\nname: Z.ai\ntype: anthropic\nbaseUrl: ${zaiAddress}\nsecret: zai-key\n`,
  "models.yaml": [
    "aliases:",
    "  open-coder-agent:",
    "    provider: zai",
    "    model: glm-5.3",
    "    price: { input: 0.6, output: 2.2 }",
    "",
  ].join("\n"),
};

/** The keychain's keys: Z.ai's, and one no bridge is given. */
export const acmeKeychain = {
  get: async (name: string) =>
    ({ "zai-key": "fake-zai-key", "other-key": "fake-other-key" })[name] ?? null,
};
