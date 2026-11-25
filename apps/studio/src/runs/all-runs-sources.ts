import type { Disposable, ServiceRegistry } from "@halonicjs/app";
import type { AgentMessaging, MessagingAgent, TeamRuns } from "@halonicjs/ports";
import {
  type AllRunsRow,
  AllRunsService,
  type RunsSource,
  RunsSourceService,
  teamAppRun,
  workflowAppRun,
} from "@halonicjs/studio-feature-runs/api";
import {
  type AgentActivity,
  AgentActivityService,
  AgentMessagingService,
  AllRuns,
  type RunSource,
} from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** How far back the Runs app reads a team's ended runs. */
export const teamRunsDays = 30;

/** The open workspace's run changes, which read every source again; the folder's registry stops it. */
export const allRunsWatchKey: ServiceKey<Disposable> = serviceKey<Disposable>("studio.all-runs");

/** The name of the stand-in source when the teams can't be listed. */
export const teamsListName = "your teams";

/**
 * Provides the Runs app's runs (`AllRunsService`, HAL-18749) for the open
 * workspace and every team its agent host connects: the workspace's own runs
 * and each team's runs of the last 30 days. Without an agent host nothing is
 * provided, and the Runs page shows the workspace's own list.
 *
 * @param name - the workspace's name, which its rows say they run in
 */
export function provideAllRuns(
  services: ServiceRegistry,
  name: string,
  now: () => Date = () => new Date(),
): void {
  if (!services.has(AgentActivityService) || !services.has(AgentMessagingService)) return;
  const runs = services.get(RunsSourceService);
  const activity = services.get(AgentActivityService);
  const messaging = services.get(AgentMessagingService);
  const workspace = workspaceRunSource(runs, name, now);
  const all = new AllRuns<AllRunsRow>(async () => [
    workspace,
    ...(await teamRunSources(messaging, activity, now)),
  ]);
  services.provide(AllRunsService, all);
  services.provide(allRunsWatchKey, { dispose: runs.subscribe(() => void all.refresh()) });
}

/** The open workspace's runs, as the Runs page reads them, without its test runs. */
export function workspaceRunSource(
  runs: RunsSource,
  name: string,
  now: () => Date,
): RunSource<AllRunsRow> {
  return {
    id: `workspace:${runs.folder ?? name}`,
    name,
    read: async () => {
      const currency = runs.currency();
      const at = now();
      return (await runs.list()).flatMap((run) => {
        const routineId = run.summary.trigger?.routineId;
        const row = workflowAppRun(
          run,
          {
            workflow: runs.workflow(run.summary.hubId, run.summary.workflowId),
            routine: routineId === undefined ? undefined : runs.routine(routineId),
            currency,
            now: at,
          },
          name,
        );
        return row === undefined ? [] : [row];
      });
    },
  };
}

/**
 * One source per connected team. The teams share one read of the runs and
 * the agents per refresh. When the teams can't be listed, one source stands
 * in for them and fails with that error, so the workspace's runs still show.
 */
export async function teamRunSources(
  messaging: AgentMessaging,
  activity: AgentActivity,
  now: () => Date,
): Promise<RunSource<AllRunsRow>[]> {
  let teams: Awaited<ReturnType<AgentMessaging["listSources"]>>;
  try {
    teams = await messaging.listSources();
  } catch (error) {
    return [{ id: "teams", name: teamsListName, read: () => Promise.reject(error) }];
  }
  let shared: Promise<[readonly TeamRuns[], readonly MessagingAgent[]]> | undefined;
  const read = () => {
    shared ??= Promise.all([activity.runs({ since: sinceOf(now()) }), messaging.listAgents()]);
    return shared;
  };
  return teams.map((team) => ({
    id: team.id,
    name: team.label,
    read: async () => {
      const [answers, agents] = await read();
      const answer = answers.find((candidate) => candidate.source === team.id);
      if (answer === undefined) return [];
      return answer.runs.map((run) => {
        const agent = agents.find((candidate) => candidate.id === run.agent);
        return teamAppRun(run, { where: team.label, agent, asOf: answer.asOf });
      });
    },
  }));
}

/** Midnight UTC 30 days back: the same bound all day, so the agent host can reuse its answer. */
function sinceOf(now: Date): string {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(day - teamRunsDays * 86_400_000).toISOString();
}
