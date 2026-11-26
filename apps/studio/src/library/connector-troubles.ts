import {
  type ConnectorTrouble,
  connectorTroubleOf,
  integrationsFolder,
  readIntegrationSheets,
} from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import type { RequestLogs } from "../assistant/chat-request-log.ts";

/**
 * What went wrong with the last call of each local integration's connector, by connector id
 * (`app.connector-trouble`, HAL-18391 plan section 2.4). A connector runs the integration in its
 * folder, whose sheet names the id that names its request log. The log only explains a failure,
 * so one that can't be read, or a folder whose sheet doesn't read, gives no trouble rather than
 * failing the list. Without `logs`, as without an agent host, no connector has a trouble.
 */
export async function connectorTroubles(
  files: DefinitionSource,
  connectors: readonly Connector[],
  logs: RequestLogs | undefined,
): Promise<ReadonlyMap<string, ConnectorTrouble>> {
  const local = connectors.flatMap(({ id, transport }) =>
    "integration" in transport
      ? [{ id, folder: `${integrationsFolder}/${transport.integration.folder}` }]
      : [],
  );
  if (logs === undefined || local.length === 0) return new Map();
  const sheets = await readIntegrationSheets(files).catch(() => []);
  const found = await Promise.all(
    local.map(async ({ id, folder }) => {
      const sheet = sheets.find((each) => each.folder === folder)?.sheet;
      if (sheet === undefined) return undefined;
      const trouble = connectorTroubleOf(await logs(sheet.id).catch(() => []));
      return trouble === undefined ? undefined : ([id, trouble] as const);
    }),
  );
  return new Map(found.filter((entry) => entry !== undefined));
}
