// The two failure lines of a run the proxy failed (HAL-12606): a
// `model-unreachable` run whose cause is the proxy, not the network, so
// line 1 names the proxy and line 2 gives the one fix for it.

import type { ProxyFailure } from "@halonicjs/app/run-failure";
import { type Phrase, phrase } from "./phrase.ts";

/** Line 1 of `proxy-failed`: what the proxy did, naming it and the variable it came from. */
export function proxyProblemInWords(failure: ProxyFailure): Phrase {
  const { provider, variable } = failure;
  switch (failure.problem) {
    case "setting":
      return phrase`the proxy setting in ${variable} isn't one Halonic can use, so nothing was sent to ${provider}.`;
    case "unreachable":
      return phrase`Halonic couldn't reach your proxy ${failure.proxy} from ${variable}, so nothing was sent to ${provider}.`;
    case "timeout":
      return phrase`your proxy ${failure.proxy} from ${variable} didn't answer in time, so nothing was sent to ${provider}.`;
    case "refused":
      return phrase`your proxy ${failure.proxy} from ${variable} refused to connect to ${failure.host}.`;
    case "credentials":
      return phrase`your proxy ${failure.proxy} from ${variable} refused the user name and password.`;
    case "plain-http":
      return phrase`${provider} is at ${failure.host} over plain http, which Halonic never sends through the proxy in ${variable}.`;
    case "insecure":
      return phrase`the connection to ${failure.host} through your proxy ${failure.proxy} failed its security check.`;
    case "other":
      return phrase`Halonic couldn't use your proxy from ${variable} to reach ${provider}.`;
  }
}

/** Line 2 of `proxy-failed`: the one fix for that problem. */
export function proxyFixInWords(failure: ProxyFailure): Phrase {
  const { provider, variable } = failure;
  switch (failure.problem) {
    case "setting":
      return phrase`Set ${variable} to http://host:port, then run again.`;
    case "unreachable":
    case "timeout":
      return phrase`Start your proxy, or set ${variable} to one that runs, then run again.`;
    case "refused":
      return phrase`Ask whoever runs your proxy to allow ${failure.host}, then run again.`;
    case "credentials":
      return phrase`Fix the user name and password in ${variable}, then run again.`;
    case "plain-http":
      return phrase`Give ${provider} an https:// baseUrl, or add ${failure.host} to NO_PROXY, then run again.`;
    case "insecure":
      return phrase`If your proxy re-signs https, set NODE_EXTRA_CA_CERTS to your company's certificate, then run again.`;
    case "other":
      return phrase`Check ${variable}, then run again.`;
  }
}
