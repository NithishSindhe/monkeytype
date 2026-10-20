import { afterEach, describe, expect, it } from "vitest";

import { useAccountSettingsTab } from "../../src/ts/components/pages/account-settings/useAccountSettingsTab";
import { getServerConfigurationQueryOptions } from "../../src/ts/queries/server-configuration";
import { useRouteSearch } from "../../src/ts/router/search-params";
import { linkToSetting } from "../../src/ts/states/settings-highlight";
import {
  App,
  cleanupApp,
  renderApp,
  RenderAppOptions,
} from "../__harness__/app-shell";

const serverConfigurationKey = getServerConfigurationQueryOptions().queryKey;

type Probe<T> = { app: App; shown: () => unknown; hook: () => T };

/**
 * Renders the app with a probe in `page` (a stub page's component name)
 * calling `use` - the page's search hook - and showing `show(hook)` as json.
 */
function renderWithProbe<T>(
  page: string,
  use: () => T,
  show: (hook: T) => unknown,
  options: RenderAppOptions = {},
): Probe<T> {
  let hook: T | undefined;
  const app = renderApp({
    queryData: [[serverConfigurationKey, {}]],
    ...options,
    pageContent: {
      [page]: () => {
        const current = use();
        hook = current;
        return <output data-probe>{JSON.stringify(show(current))}</output>;
      },
    },
  });
  return {
    app,
    shown: () =>
      JSON.parse(
        app.container.querySelector("[data-probe]")?.textContent ?? "null",
      ) as unknown,
    hook: () => {
      if (hook === undefined) throw new Error(`${page} not shown`);
      return hook;
    },
  };
}

describe("search params", () => {
  afterEach(() => {
    cleanupApp();
  });

  describe("account settings", () => {
    function renderAccountSettings(
      url: string,
    ): Probe<ReturnType<typeof useAccountSettingsTab>> {
      return renderWithProbe(
        "AccountSettingsPage",
        useAccountSettingsTab,
        (tab) => tab.tab(),
        { url, auth: "signedIn" },
      );
    }

    it("shows the tab from the url", async () => {
      const { app, shown } = renderAccountSettings(
        "/account-settings?tab=dangerZone",
      );
      await app.settle();

      expect(shown()).toBe("dangerZone");
    });

    it("shows the account tab for a missing or invalid tab", async () => {
      const { app, shown } = renderAccountSettings(
        "/account-settings?tab=nope",
      );
      await app.settle();

      expect(shown()).toBe("account");
    });

    it("writes the tab to the url without a history entry", async () => {
      const { app, shown, hook } = renderAccountSettings("/about");
      await app.settle();
      await app.navigate({ to: "/account-settings" });
      await app.settle();

      hook().setTab("dangerZone");
      await app.settle();

      expect(app.url()).toBe("/account-settings?tab=dangerZone");
      expect(shown()).toBe("dangerZone");

      app.router.history.back();
      await app.settle();
      expect(app.url()).toBe("/about");
    });
  });

  describe("settings", () => {
    // the settings page snapshots `highlight` from its search
    function renderSettings(
      url: string,
    ): Probe<ReturnType<typeof useRouteSearch<"/settings">>> {
      return renderWithProbe(
        "SettingsPage",
        () => useRouteSearch("/settings"),
        (settings) => settings.search().highlight ?? null,
        { url },
      );
    }

    it("highlights the setting from the url", async () => {
      const { app, shown } = renderSettings("/settings?highlight=fontSize");
      await app.settle();

      expect(shown()).toBe("fontSize");
    });

    it("writes a deep link to the url without a history entry", async () => {
      const { app } = renderSettings("/about");
      await app.settle();
      await app.navigate({ to: "/settings" });
      await app.settle();

      const link = linkToSetting("fontSize");
      await app.settle();

      expect(link).toBe(
        `${window.location.origin}/settings?highlight=fontSize`,
      );
      expect(app.url()).toBe("/settings?highlight=fontSize");

      app.router.history.back();
      await app.settle();
      expect(app.url()).toBe("/about");
    });
  });
});
