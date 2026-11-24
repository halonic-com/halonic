---
"@halonicjs/app-studio": patch
---

`halonic serve`: the daily request ceiling (`limits.dailyRequests`) now counts only signed-in requests and signed webhook deliveries, so requests from someone who can't sign in no longer use up the day. A webhook delivery taken by one routine is refused when it is sent again to another routine whose secret has the same value; what senders sign is unchanged.
