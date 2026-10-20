import { qs } from "../utils/dom";
import { createErrorMessage } from "../utils/error";

// Firebase Analytics went away with Firebase Auth; events now go straight to
// the gtag queue the activation script sets up.

type Gtag = (...args: unknown[]) => void;

let isActivated = false;

export async function log(
  eventName: string,
  params?: Record<string, string>,
): Promise<void> {
  if (!isActivated) return;
  const gtag = (window as { gtag?: Gtag }).gtag;
  if (gtag === undefined) {
    console.log("Analytics unavailable");
    return;
  }
  gtag("event", eventName, params);
}

export function activateAnalytics(): void {
  if (isActivated) {
    console.warn("Analytics already activated");
    return;
  }
  console.log("Activating Analytics");
  try {
    isActivated = true;
    qs("body")?.appendHtml(`
    <script
    async
    src="https://www.googletagmanager.com/gtag/js?id=UA-165993088-1"
  ></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());

    gtag("config", "UA-165993088-1");
  </script>`);
  } catch (e) {
    isActivated = false;
    console.error(createErrorMessage(e, "Failed to activate analytics"));
  }
}
