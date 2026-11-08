import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { Connector } from "./schema.ts";

/** `library/connectors/<id>.connector.yaml`, shared at the root or a hub's own. */
export const connectorKind: FileKind<Connector> = {
  name: "connector",
  about: "Tools for agents from an MCP server or a built-in service such as Google.",
  syntax: "yaml",
  schema: Connector,
  places: [
    { scope: "workspace-and-hub", folder: "library/connectors", name: "<id>.connector.yaml" },
  ],
  idFromPlace: "fallback",
  check: checkConnector,
};

/** A tool that needs approval but isn't in `tools.allow` is never offered, so say so. */
function checkConnector(connector: Connector): KindCheckProblem[] {
  const { allow, approve } = connector.tools;
  const problems: KindCheckProblem[] = [];
  if (allow === undefined) {
    return problems;
  }
  approve.forEach((tool, index) => {
    if (allow.includes(tool)) {
      return;
    }
    problems.push({
      severity: "warning",
      code: "approved-tool-not-allowed",
      path: ["tools", "approve", index],
      message: `Connector "${connector.id}": "${tool}" needs approval but is not in tools.allow, so agents never see it`,
    });
  });
  return problems;
}
