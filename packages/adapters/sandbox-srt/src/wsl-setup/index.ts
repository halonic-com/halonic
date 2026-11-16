export { FIRST_WSL2_BUILD, WSL_KERNEL_FLOOR, type WslProblem } from "./detect.ts";
export type { ProgramResult, WslDistro, WslHost, WslPolicy } from "./host.ts";
export {
  removeWslSetup,
  type WslRemoveChoice,
  type WslRemoveHost,
  type WslRemoveResult,
} from "./remove.ts";
export {
  type WslResidual,
  WslSetup,
  type WslSetupFailureCode,
  type WslSetupOptions,
  type WslSetupResult,
} from "./setup.ts";
export {
  HALONIC_DISTRO,
  memoryWslSetupStore,
  type WslSetupState,
  type WslSetupStep,
  type WslSetupStore,
  wslSetupSteps,
} from "./state.ts";
export { systemWslHost, systemWslRemoveHost } from "./system-host.ts";
