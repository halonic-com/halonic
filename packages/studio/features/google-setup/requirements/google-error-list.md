# google-setup.google-error-list

- Status: active
- Since: 0.1.0
- Source: HAL-714; google-setup-flow (HAL-621) section 5.1; ux-checklists (HAL-1019) section 4.3 and CHECK U10 and U11

While a sign-in waits, the open step 7 shall show a folded **Google showed an error instead?**, closed until it is opened, for the errors Google shows on its own page and never sends back. Each row shall name the error as Google's page shows it and give its fix: "Error 401: invalid_client" (the client ID isn't right; **Open step 6**), "Error 400: redirect_uri_mismatch" (the client is the wrong type; **Open step 5** and **Open step 6**), "Error 403: access_denied" (the app is still in Testing; **Open step 3**, which also clears the "In production" tick). For a Workspace account it shall add "Error 403: org_internal" (choose the connector's address when Google asks) and "admin_policy_enforced" (the admin hasn't allowed the app, with **Copy a note for your admin**); a personal account shall not see those two. The list shall not show when nothing is waiting.

## Examples

- Given a waiting sign-in on a personal account,
  when you open the list,
  then it has three rows and no Workspace row.
- Given a waiting sign-in on a Workspace account,
  when you open the list,
  then it also has org_internal and admin_policy_enforced.
- Given the list is open,
  when you choose **Open step 6**,
  then step 6 opens.
- Given the access_denied row,
  when you choose **Open step 3**,
  then the "In production" tick is cleared and step 3 opens.
