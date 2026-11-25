// `library/signals/<id>.signal.yaml`: one signal the workspace switches on
// in the plugin runtime (plan HAL-17450 rev 5, "Step 2"). The file is data
// only: an id, one rule from `SIGNAL_RULES` with its settings, and whether
// the rule only logs what it would do. It can't name an action, a host or a
// key: there is no key for one.
import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";
import { SIGNAL_RULES, type SignalRuleName } from "./rules.ts";

/** The most bytes a signal file may have; a larger one is refused before it is parsed. */
export const MAX_SIGNAL_FILE_BYTES = 16 * 1024;

/** `rule` for one rule name: `run` names it, `with` holds its settings. */
function ruleChoice<Name extends SignalRuleName>(name: Name) {
  return s
    .object({
      run: s.literal(name),
      with: SIGNAL_RULES[name].settings,
    })
    .strict();
}

/** Which rule the signal switches on, and its settings. An unknown rule is refused. */
export const SignalRuleChoice = s.discriminatedUnion("run", [
  ruleChoice("pr-watcher"),
  ruleChoice("board-ask"),
  ruleChoice("task-effort"),
]);

/** A workspace signal, as `library/signals/<id>.signal.yaml` holds it. */
export const Signal = s
  .object({
    version,
    id,
    rule: SignalRuleChoice,
    /** Log what the rule would do and change nothing. */
    dryRun: s.boolean().default(false),
  })
  .strict();

/** A workspace signal, with defaults filled in. */
export type Signal = Infer<typeof Signal>;
