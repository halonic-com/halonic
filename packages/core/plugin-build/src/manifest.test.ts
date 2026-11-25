import type { Tool, WorkspaceSnapshot } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginManifestText, pluginPackageJsonText, toolParametersSchema } from "./manifest.ts";
import { acmeCommit } from "./test/acme.test-helper.ts";

const prStatus: Tool = {
  version: 1,
  id: "pr-status",
  name: "pr_status",
  description: "Reads one pull request's checks and queue state.",
  parameters: {
    pr: { type: "integer", description: "The pull request's number.", required: true, minimum: 1 },
    repo: {
      type: "string",
      description: "Which repository.",
      required: false,
      enum: ["acme/website"],
      maxLength: 1000,
    },
  },
  callers: "everyone",
  action: { run: "github.pull-request", with: { repositories: ["acme/website"] } },
};

function snapshotNamed(name: string): WorkspaceSnapshot {
  return { format: 1, workspace: { name, commit: acmeCommit }, tools: [prStatus] };
}

/** Runs the manifest module's text and returns what it exports. */
async function manifestOf(text: string): Promise<Record<string, unknown>> {
  const module = await import(`data:text/javascript,${encodeURIComponent(text)}`);
  return module.default;
}

function manifestText(name = "Acme", capabilities = ["agents.read"]) {
  return pluginManifestText({
    pluginId: "halonic-ws.acme",
    version: "0.1.0",
    snapshot: snapshotNamed(name),
    capabilities,
    settings: { githubToken: { type: "string", format: "secret-ref" } },
  });
}

verifies("plugin-build.manifest", () => {
  it("declares each tool with a parameters schema that requires only the required ones", async () => {
    const manifest = await manifestOf(manifestText());

    expect(manifest).toEqual({
      id: "halonic-ws.acme",
      apiVersion: 1,
      version: "0.1.0",
      displayName: "Acme",
      description: "The tools of the Acme workspace, built by Halonic.",
      author: "Acme",
      categories: ["automation"],
      capabilities: ["agents.read"],
      entrypoints: { worker: "worker.js" },
      tools: [
        {
          name: "pr_status",
          displayName: "pr_status",
          description: "Reads one pull request's checks and queue state.",
          parametersSchema: {
            type: "object",
            properties: {
              pr: { type: "integer", description: "The pull request's number.", minimum: 1 },
              repo: {
                type: "string",
                description: "Which repository.",
                enum: ["acme/website"],
                maxLength: 1000,
              },
            },
            required: ["pr"],
            additionalProperties: false,
          },
        },
      ],
      instanceConfigSchema: {
        type: "object",
        properties: { githubToken: { type: "string", format: "secret-ref" } },
      },
    });
  });

  it("declares an object parameter as an object of its fields and a list as an array", () => {
    const parameters: Tool["parameters"] = {
      monitor: {
        type: "object",
        description: "When to wake you.",
        required: false,
        fields: {
          ref: { type: "string", description: "What you wait on.", required: true, maxLength: 200 },
          inMinutes: { type: "integer", description: "Minutes.", required: true, minimum: 15 },
        },
      },
      blockedBy: {
        type: "list",
        description: "The tasks.",
        required: true,
        items: { type: "string", maxLength: 40 },
        maxItems: 10,
      },
    };

    expect(toolParametersSchema({ parameters })).toEqual({
      type: "object",
      properties: {
        monitor: {
          type: "object",
          description: "When to wake you.",
          properties: {
            ref: { type: "string", description: "What you wait on.", maxLength: 200 },
            inMinutes: { type: "integer", description: "Minutes.", minimum: 15 },
          },
          required: ["inMinutes", "ref"],
          additionalProperties: false,
        },
        blockedBy: {
          type: "array",
          description: "The tasks.",
          items: { type: "string", maxLength: 40 },
          maxItems: 10,
        },
      },
      required: ["blockedBy"],
      additionalProperties: false,
    });
  });

  it("keeps a workspace name that looks like code inside a JSON string", async () => {
    // A quote, a closing tag and a template placeholder, put together so no linter reads it as one.
    const name = ['Acme "</script>`$', "{process.exit()}`"].join("");
    const manifest = await manifestOf(manifestText(name));

    expect(manifest["displayName"]).toBe(name);
    expect(manifest["id"]).toBe("halonic-ws.acme");
  });

  it("lists each capability once, sorted", async () => {
    const manifest = await manifestOf(
      manifestText("Acme", ["metrics.write", "agents.read", "metrics.write"]),
    );

    expect(manifest["capabilities"]).toEqual(["agents.read", "metrics.write"]);
  });

  it("gives the same text for the same inputs", () => {
    expect(manifestText()).toBe(manifestText());
  });

  it("writes package.json with the plugin's name, version and entry files", () => {
    expect(JSON.parse(pluginPackageJsonText("halonic-ws.acme", "0.3.0"))).toEqual({
      name: "halonic-ws.acme",
      version: "0.3.0",
      private: true,
      type: "module",
      paperclipPlugin: { manifest: "./manifest.js", worker: "./worker.js" },
    });
  });
});
