import type { SandboxStartCheck } from "@halonicjs/app";
import type {
  CloseStack,
  ItemPageSectionListing,
  SaveState,
  SectionsProps,
} from "@halonicjs/studio-shell";
import type { ComponentType } from "react";
import type { AgentRef, AgentRoutine, AgentsHost, AgentToolList, AgentUser } from "../api.ts";
import type { AgentReviewHost } from "../review-api.ts";

/** Props for `AgentScreen`. */
export interface AgentScreenProps extends AgentRef {
  readonly host: AgentsHost;
  /** The window's save state, for the toolbar's "1 field not saved"; absent without a window. */
  readonly saving?: Pick<SaveState, "setFieldsNotSaved"> | undefined;
  /** Leaves an agent that is gone for the Agents list; absent where the shell can't open a place. */
  readonly goToAgents?: (() => void) | undefined;
  /** Opens a workspace file in a tab, for **Open as file**; absent where the app can't, which leaves it out of the menu. */
  readonly openFile?: ((path: string) => void) | undefined;
  /** Opens Library on a Tools list's tab, for **Open Library ›**; absent where the app can't. */
  readonly openLibrary?: ((list: AgentToolList) => void) | undefined;
  /** Opens the Runs page, for **Open the Runs page ›**; absent where the app can't open a place. */
  readonly openRuns?: (() => void) | undefined;
  /**
   * Opens where keys are kept, for the Try it chat's **Go to the key field ›** and **Open Models**;
   * with a secret name, that provider's key block, for **Set the key ›**.
   */
  readonly openKeyField?: ((secretName?: string) => void) | undefined;
  /** Opens Workspace settings at its Budget block, for the Try it budget line's **Change budget**. */
  readonly openBudget?: (() => void) | undefined;
  /** The window's close stack, so Esc closes the top card; a page of its own without one. */
  readonly closeStack?: CloseStack | undefined;
  /** Reads a sentence to screen readers, such as "*Writer* was removed." when its card drops. */
  readonly announce?: ((text: string, politeness?: "polite" | "assertive") => void) | undefined;
  /** Opens another agent's page, from a card's team chart; absent where the app can't. */
  readonly openAgent?: ((agent: AgentRef) => void) | undefined;
  /**
   * Opens a workflow's page with the steps that run the agent outlined, from its card on the agent
   * map; absent where the app can't.
   */
  readonly openWorkflow?: ((workflow: AgentUser) => void) | undefined;
  /** Opens a routine's page, from its card on the agent map; absent where the app can't. */
  readonly openRoutine?: ((routine: AgentRoutine) => void) | undefined;
  /** The sections other features add to the page, such as Triggers; Configuration lists them as pages. */
  readonly sections?: readonly ItemPageSectionListing[] | undefined;
  /** The shell's component that draws them; absent where there's no window. */
  readonly Sections?: ComponentType<SectionsProps> | undefined;
  /**
   * Set when the page was asked to open at the model, and changed each time it is asked again:
   * Configuration then shows its Model page with the picker focused.
   */
  readonly modelRequest?: string | undefined;
  /**
   * Set when the page was asked to open at Where it runs, and changed each time it is asked again:
   * Configuration then shows its Harness page, as the Try it chat's **Open Harness settings ›** does.
   */
  readonly harnessRequest?: string | undefined;
  /** Checks that the sandbox can start a program, for the Try it chat of an agent that starts one. */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** The assistant's changes to the agent, for the item bar and the marks; none where absent. */
  readonly review?: AgentReviewHost | undefined;
  /** The page ⋮'s **Show in chat** (`assistant.chat.show-in-chat`); none without the Assistant. */
  readonly showInChat?:
    | { readonly label: string; readonly show: (name: string) => void }
    | undefined;
}
