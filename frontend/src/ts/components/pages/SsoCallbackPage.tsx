import { JSXElement, onMount } from "solid-js";

import { handleRedirectCallback } from "../../auth-client";
import { navigate } from "../../router/navigate";
import { showErrorNotification } from "../../states/notifications";
import { LoadingPage } from "./LoadingPage";

/**
 * The landing page of Clerk's SSO redirect (`/sso-callback`): Clerk finishes
 * the sign in here, then the user goes back to the test page. A brand new
 * Clerk user has no Monkeytype profile yet, so the auth state change opens
 * the pick username modal (see `auth.ts`).
 */
export function SsoCallbackPage(): JSXElement {
  onMount(() => {
    void handleRedirectCallback()
      .catch((error: unknown) => {
        showErrorNotification("Failed to sign in with Google", { error });
      })
      .finally(() => {
        void navigate({ to: "/", replace: true });
      });
  });

  return <LoadingPage spinner={{ text: "Signing in..." }} />;
}
