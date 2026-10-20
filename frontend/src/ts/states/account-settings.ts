import { z } from "zod";
import { FaSolidIcon } from "../types/font-awesome";

export const AccountSettingsTabSchema = z.enum([
  "account",
  "authentication",
  "dangerZone",
]);
export type AccountSettingsTab = z.infer<typeof AccountSettingsTabSchema>;

export const accountSettingsTabs: Record<
  AccountSettingsTab,
  { icon: FaSolidIcon; text: string }
> = {
  account: { text: "account", icon: "fa-user" },
  authentication: { text: "authentication", icon: "fa-key" },
  dangerZone: { text: "danger zone", icon: "fa-exclamation-triangle" },
};

/** The account settings url search params, taking strings in. */
export const AccountSettingsSearchSchema = z.object({
  tab: AccountSettingsTabSchema.optional().catch(undefined),
});
