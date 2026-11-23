/**
 * The thin-spec check's Haiku reading (HAL-17076): the triage prompt and JSON
 * schema from halonic-com/variant-router `enrich.py`, ported word for word, and
 * the reading it answers with. Pure, so the tests need no host.
 *
 * The trial also gave Haiku a repository context (packages and files the task
 * names, read from a checkout). The plugin has no checkout, so it sends the
 * task alone and says so; the week of logged checks shows whether the flag
 * rate moved (HAL-17072).
 */

/** The model the trial's readings came from; the score's weights were fitted on its answers. */
export const readingModel = "claude-haiku-5-5";

/** As in the trial: the reading is a dozen short fields. */
export const readingMaxTokens = 2000;

/** How much of a task's description the check reads, as much as the difficulty tagger. */
export const descriptionLimit = 4000;

/** The trial's instruction, word for word. */
export const readingInstruction = `You triage coding tasks before any agent works on them. Read the task and the repository
context (taken at the commit the work starts from) and fill in the fields. Judge only from what is
given; do not guess the solution. Counts are your best estimate of files/packages the change will touch.`;

/** What the plugin sends in place of the trial's repository context. */
export const noRepositoryContext = "(none given: judge from the task text alone)";

export const changeKinds = ["feature", "fix", "wording", "refactor", "mixed"] as const;
export const uiOrLogic = ["ui", "logic", "both"] as const;
const languages = ["typescript", "tsx_react", "javascript", "python", "shell", "other"] as const;

/** The risk areas the score counts, in the trial's order. */
export const riskAreas = [
  "security_trust_sandbox",
  "concurrency_async",
  "persistence_migration",
  "cross_package_contract",
  "ui_state",
  "cli_output_format",
  "external_api",
  "build_ci",
] as const;

/** The trial's answer schema, word for word. */
export const readingSchema = {
  type: "object",
  properties: {
    spec_precision: {
      type: "integer",
      description: "1 vague .. 5 exact names, messages and shapes given",
    },
    ambiguity: {
      type: "integer",
      description: "1 one obvious reading .. 5 many plausible readings",
    },
    expected_files: { type: "integer" },
    expected_packages: { type: "integer" },
    change_kind: { type: "string", enum: changeKinds },
    ui_vs_logic: { type: "string", enum: uiOrLogic },
    needs_new_api_or_type: { type: "boolean" },
    existing_tests_must_change: { type: "boolean" },
    language: { type: "string", enum: languages },
    risk_areas: { type: "array", items: { type: "string", enum: [...riskAreas, "none"] } },
    difficulty: {
      type: "integer",
      description: "1 trivial .. 5 very hard for a strong engineer",
    },
    cheap_model_fit: {
      type: "integer",
      description: "1 needs a top model .. 5 a small fast model will do",
    },
    likely_packages: {
      type: "array",
      items: { type: "string" },
      description:
        "up to 5 package paths from the given list that the change will most likely touch",
    },
  },
  required: [
    "spec_precision",
    "ambiguity",
    "expected_files",
    "expected_packages",
    "change_kind",
    "ui_vs_logic",
    "needs_new_api_or_type",
    "existing_tests_must_change",
    "language",
    "risk_areas",
    "difficulty",
    "cheap_model_fit",
    "likely_packages",
  ],
  additionalProperties: false,
} as const;

/** The task text the check reads: its title and the start of its description. */
export function taskText(title: string, description: string | null): string {
  const start = (description ?? "").slice(0, descriptionLimit);
  return `${title}\n\n${start}`;
}

/** The Messages API request body, laid out as the trial sent it. */
export function readingRequest(text: string): Record<string, unknown> {
  const content = `${readingInstruction}\n\n<task>\n${text}\n</task>\n\n<repository_context>\n${noRepositoryContext}\n</repository_context>`;
  return {
    model: readingModel,
    max_tokens: readingMaxTokens,
    output_config: { effort: "low", format: { type: "json_schema", schema: readingSchema } },
    messages: [{ role: "user", content }],
  };
}

/** The fields of Haiku's reading the score uses. */
export interface Reading {
  readonly specPrecision: number;
  readonly ambiguity: number;
  readonly expectedFiles: number;
  readonly expectedPackages: number;
  readonly changeKind: (typeof changeKinds)[number];
  readonly uiVsLogic: (typeof uiOrLogic)[number];
  readonly needsNewApiOrType: boolean;
  readonly existingTestsMustChange: boolean;
  readonly language: (typeof languages)[number];
  /** Without "none". */
  readonly riskAreas: readonly (typeof riskAreas)[number][];
  readonly difficulty: number;
  readonly cheapModelFit: number;
}

function oneOf<T extends string>(known: readonly T[], value: unknown): T | undefined {
  return known.find((item) => item === value);
}

function whole(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Reads Haiku's JSON, or undefined when it isn't the schema's shape. The
 * schema binds the answer, but the task text is anyone's writing, so every
 * field is checked rather than trusted.
 */
export function parseReading(text: string): Reading | undefined {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const risks = Array.isArray(raw["risk_areas"]) ? raw["risk_areas"] : undefined;
  const reading = {
    specPrecision: whole(raw["spec_precision"]),
    ambiguity: whole(raw["ambiguity"]),
    expectedFiles: whole(raw["expected_files"]),
    expectedPackages: whole(raw["expected_packages"]),
    changeKind: oneOf(changeKinds, raw["change_kind"]),
    uiVsLogic: oneOf(uiOrLogic, raw["ui_vs_logic"]),
    needsNewApiOrType: raw["needs_new_api_or_type"],
    existingTestsMustChange: raw["existing_tests_must_change"],
    language: oneOf(languages, raw["language"]),
    riskAreas: risks?.flatMap((risk) => oneOf(riskAreas, risk) ?? []),
    difficulty: whole(raw["difficulty"]),
    cheapModelFit: whole(raw["cheap_model_fit"]),
  };
  const complete = Object.values(reading).every((value) => value !== undefined);
  const flags = [reading.needsNewApiOrType, reading.existingTestsMustChange];
  if (!complete || !flags.every((flag) => typeof flag === "boolean")) {
    return undefined;
  }
  return reading as Reading;
}
