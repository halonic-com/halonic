/**
 * Public entry point of `@halonicjs/adapter-paperclip-client`: the Paperclip
 * provider behind `AgentMessaging` and `TeamStatus`, and its fixed request list.
 */
export { UnsafeAddressError } from "./address.ts";
export { PaperclipMessaging, type PaperclipMessagingOptions } from "./client.ts";
export {
  findRequest,
  type PaperclipRequestName,
  paperclipRequests,
  UnsafeIdError,
} from "./requests.ts";
export { PaperclipTeamStatus, type PaperclipTeamStatusOptions } from "./team-status.ts";
export { PaperclipClientError, type PaperclipFailure } from "./transport.ts";
