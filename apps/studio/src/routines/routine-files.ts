import type { RoutineTrigger as FileTrigger, Routine } from "@halonicjs/format";
import type {
  RoutineChanges,
  RoutineRef,
  RoutineTarget,
  RoutineTrigger,
} from "@halonicjs/studio-feature-routines/api";

/** Where the routine files of a hub, or of the workspace's root, are kept. */
export const routineFolder = (hubId: string | null): string =>
  hubId === null ? "workflows/routines" : `hubs/${hubId}/workflows/routines`;

const routineSuffix = ".routine.yaml";

/** The path of a routine's file. */
export const routinePath = ({ hubId, id }: RoutineRef): string =>
  `${routineFolder(hubId)}/${id}${routineSuffix}`;

/** The id of a routine file at `path` in `folder`, or `undefined` when it isn't one. */
export function routineIdOf(folder: string, path: string): string | undefined {
  if (!path.startsWith(`${folder}/`) || !path.endsWith(routineSuffix)) return undefined;
  const id = path.slice(folder.length + 1, -routineSuffix.length);
  return id.includes("/") ? undefined : id;
}

/** The text of a new routine that starts `target` by hand. The id is the file's name. */
export function newRoutineText(name: string, target: RoutineTarget): string {
  return [
    // A JSON string is a YAML double-quoted one, so any name a person types is safe.
    `name: ${JSON.stringify(name)}`,
    "trigger:",
    "  manual: true",
    "run:",
    ...(target.kind === "workflow"
      ? [`  workflow: ${target.id}`, "  input: {}"]
      : [`  agent: ${target.id}`, `  prompt: ${JSON.stringify(target.prompt)}`]),
    "",
  ].join("\n");
}

/** A trigger as the file holds it, in the shape the page's fields hold it. */
export function triggerOfFile(trigger: FileTrigger): RoutineTrigger {
  if ("schedule" in trigger) {
    return { kind: "schedule", cron: trigger.schedule, timeZone: trigger.timezone };
  }
  if ("every" in trigger) return { kind: "every", interval: trigger.every };
  if ("manual" in trigger) return { kind: "manual" };
  if ("mail" in trigger) {
    const { connector, query, every } = trigger.mail;
    return { kind: "mail", connector, query, every };
  }
  if ("signal" in trigger) {
    return { kind: "signal", name: trigger.signal.name, when: trigger.signal.when };
  }
  return { kind: "webhook" };
}

/**
 * A trigger as the file holds it. A webhook keeps the secret name and headers the file already
 * has: the page doesn't edit them, and a webhook it didn't read has none to keep.
 */
export function triggerToFile(trigger: RoutineTrigger, current: FileTrigger): FileTrigger {
  switch (trigger.kind) {
    case "schedule":
      return {
        schedule: trigger.cron,
        ...(trigger.timeZone === undefined ? {} : { timezone: trigger.timeZone }),
      };
    case "every":
      return { every: trigger.interval };
    case "manual":
      return { manual: true };
    case "mail":
      return {
        mail: { connector: trigger.connector, query: trigger.query, every: trigger.every },
      };
    case "signal":
      return {
        signal: {
          name: trigger.name,
          ...(trigger.when === undefined ? {} : { when: trigger.when }),
        },
      };
    case "webhook":
      if ("webhook" in current) return current;
      throw new Error("A webhook trigger can't be made on the page: it needs a secret.");
  }
}

/** A target as the page's fields hold it; the hub is the routine's own when the file names none. */
export function targetOfFile(run: Routine["run"], routineHub: string | null): RoutineTarget {
  const hubId = run.hub ?? routineHub ?? "";
  if ("workflow" in run) {
    return { kind: "workflow", hubId, id: run.workflow, input: JSON.stringify(run.input, null, 2) };
  }
  return { kind: "agent", hubId, id: run.agent, prompt: run.prompt };
}

/**
 * A target as the file holds it. The hub is written only when it isn't the routine's own, so a
 * routine that runs in its hub stays free of a line it doesn't need.
 *
 * @throws SyntaxError when a workflow's input isn't a JSON object
 */
export function targetToFile(target: RoutineTarget, routineHub: string | null): Routine["run"] {
  const hub = target.hubId === routineHub || target.hubId === "" ? {} : { hub: target.hubId };
  if (target.kind === "agent") return { ...hub, agent: target.id, prompt: target.prompt };
  const input: unknown = JSON.parse(target.input);
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SyntaxError("The input has to be a JSON object, such as {}.");
  }
  return { ...hub, workflow: target.id, input: input as Record<string, unknown> };
}

/** The edits of the file that write `changes`, one for each field present. */
export function editsOf(
  changes: RoutineChanges,
  current: Routine,
  routineHub: string | null,
): { readonly kind: "set"; readonly path: string[]; readonly value: unknown }[] {
  const edits: { kind: "set"; path: string[]; value: unknown }[] = [];
  const set = (field: string, value: unknown) => edits.push({ kind: "set", path: [field], value });
  if (changes.name !== undefined) set("name", changes.name);
  if (changes.enabled !== undefined) set("enabled", changes.enabled);
  if (changes.trigger !== undefined)
    set("trigger", triggerToFile(changes.trigger, current.trigger));
  if (changes.target !== undefined) set("run", targetToFile(changes.target, routineHub));
  if (changes.overlap !== undefined) set("overlap", changes.overlap);
  if (changes.catchUp !== undefined) set("catchUp", changes.catchUp);
  return edits;
}
