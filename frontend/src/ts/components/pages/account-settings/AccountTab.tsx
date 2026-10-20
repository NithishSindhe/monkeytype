import { showModal } from "../../../states/modals";
import { getSnapshot } from "../../../states/snapshot";
import { Fa } from "../../common/Fa";
import { showResetPersonalBestsModal } from "../../modals/account-settings/ConfirmModals";
import { showUpdateNameModal } from "../../modals/account-settings/UpdateNameModal";
import { Section } from "./utils";

export function AccountTab() {
  return (
    <>
      <UpdateAccountName />
      <UpdateStreakOffset />
      <ResetPersonalBests />
    </>
  );
}

function UpdateAccountName() {
  return (
    <Section
      title="update account name"
      fa={{ icon: "fa-user" }}
      description=<>
        Change the name of your account.{" "}
        <span class="text-error">You can only do this once every 30 days.</span>
      </>
      button={{
        text: "update name",
        onClick: () => showUpdateNameModal(),
      }}
    />
  );
}

function UpdateStreakOffset() {
  return (
    <Section
      title="set streak hour offset"
      fa={{ icon: "fa-clock" }}
      description=<>
        Streaks reset at midnight UTC by default. If this is not convenient for
        you (for example if it means that streaks reset in the middle of the
        day), you can change the hour offset here.{" "}
        <span class="text-error">You can only do this once!</span>
      </>
      button={{
        text: "update hour offset",
        onClick: () => showModal("StreakHourOffset"),
      }}
      disabled={getSnapshot()?.streakHourOffset !== undefined}
      disabledDescription=<>
        <Fa icon="fa-exclamation-triangle" /> You have already set your streak
        hour offset to{" "}
        {`${(getSnapshot()?.streakHourOffset ?? 0) > 0 ? "+" : ""} ${getSnapshot()?.streakHourOffset}`}
        .
      </>
    />
  );
}

function ResetPersonalBests() {
  return (
    <Section
      title="reset personal bests"
      fa={{ icon: "fa-crown" }}
      description=<>
        Resets all your personal bests (but doesn&apos;t delete any tests from
        your history). <span class="text-error">You can&apos;t undo this!</span>
      </>
      button={{
        text: "reset personal bests",
        onClick: () => showResetPersonalBestsModal(),
      }}
    />
  );
}
