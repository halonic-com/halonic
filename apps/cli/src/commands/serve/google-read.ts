import { googleSetupSubject, type SetupRecords } from "@halonicjs/google-setup";
import type { GoogleSetupReadPorts } from "@halonicjs/host-server";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { workspaceIntegrations } from "../../workspace-trust.ts";

/** What the served workspace's Google setups are read from. */
export interface WorkspaceGoogleReadOptions {
  /** The setup records of this computer's profile. */
  readonly setups: SetupRecords;
  /** The workspace's key in the profile: a record is shown only when its link names it. */
  readonly workspaceKey: string;
  /** The workspace's real folder, where the local integrations are read at every request. */
  readonly root: string;
  /** Reads the live version at every request, so a committed connector change shows at once. */
  readonly workspace: () => Promise<LoadedWorkspace>;
}

/**
 * The read-only Google setup ports of `halonic serve`: the records of this computer, limited to the
 * ones linked to the served workspace, each with the address and services of the connector it is
 * linked to. A record of another workspace, or whose connector is gone, isn't a Google one or has no
 * Google integration, is left out, as the CLI's sign-in refuses it.
 */
export function workspaceGoogleRead(options: WorkspaceGoogleReadOptions): GoogleSetupReadPorts {
  const { setups, workspaceKey, root, workspace } = options;
  return {
    setups: {
      read: async (accountRef) => {
        const record = await setups.read(accountRef);
        return record?.connector.workspace === workspaceKey ? record : null;
      },
      list: async () =>
        (await setups.list()).filter((record) => record.connector.workspace === workspaceKey),
    },
    source: {
      describe: async (accountRef) => {
        const record = await setups.read(accountRef).catch(() => null);
        if (record === null || record.connector.workspace !== workspaceKey) {
          return null;
        }
        const subject = googleSetupSubject(
          filesOf(await workspace(), "connector").map((file) => file.value),
          await workspaceIntegrations(root, root),
          record.connector.id,
        );
        // Without a ticked service there are no steps to show, and the steps refuse to be made.
        return subject.kind === "found" && subject.services.length > 0
          ? { account: subject.address, services: subject.services }
          : null;
      },
    },
  };
}
