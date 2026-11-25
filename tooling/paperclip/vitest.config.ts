import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

export default definePackageTestConfig({
  // A workflow file is imported as its text, as esbuild's text loader does in the bundle.
  plugins: [
    {
      name: "workflow-yaml-text",
      transform(code, id) {
        return id.endsWith(".workflow.yaml") ? `export default ${JSON.stringify(code)};` : null;
      },
    },
  ],
});
