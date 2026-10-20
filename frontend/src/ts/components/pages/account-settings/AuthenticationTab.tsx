import { openUserProfile } from "../../../auth-client";
import { showRevokeAllTokensModal } from "../../modals/account-settings/ConfirmModals";
import { Section } from "./utils";

export function AuthenticationTab() {
  return (
    <>
      <ManageAccount />
      <RevokeAllTokens />
    </>
  );
}

function ManageAccount() {
  return (
    <Section
      title="manage account"
      fa={{ icon: "fa-lock" }}
      description=<>Update your email, password and connected accounts.</>
      button={{
        text: "manage account",
        onClick: () => openUserProfile(),
      }}
    />
  );
}

function RevokeAllTokens() {
  return (
    <Section
      title="revoke all tokens"
      fa={{ icon: "fa-user-slash" }}
      description=<>
        Revokes all tokens connected to your account. Do this if you think
        someone else has access to your account.
        <br />
        <span class="text-error">This will log you out of all devices.</span>
      </>
      button={{
        text: "revoke all tokens",
        class:
          "[--themable-button-bg:var(--error-color)] [--themable-button-text:var(--bg-color)]",
        onClick: () => showRevokeAllTokensModal(),
      }}
    />
  );
}
