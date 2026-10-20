import { z } from "zod";

import Ape from "../../../ape";
import { signOut } from "../../../auth";
import { resetConfig } from "../../../config/lifecycle";
import { getSnapshot } from "../../../db";
import { isAuthenticated } from "../../../states/core";
import { showNoticeNotification } from "../../../states/notifications";
import { ExecReturn, showSimpleModal } from "../../../states/simple-modal";
import FileStorage from "../../../utils/file-storage";
import { reloadAfter } from "../../../utils/misc";

export function showDeleteAccountModal(): void {
  showConfirmModal({
    title: "Delete account",
    buttonText: "delete",
    confirmText: `I understand that all my data will be deleted and cannot be recovered.`,
    action: async () => {
      showNoticeNotification("Deleting all data...");
      const response = await Ape.users.delete();

      if (response.status !== 200) {
        return {
          status: "error",
          message: "Failed to delete user data",
          notificationOptions: { response },
        };
      }

      // only the Monkeytype profile is gone: the Clerk account is shared with
      // other apps, so it is kept and the user is just signed out here
      signOut();
      reloadAfter(3);

      return {
        status: "success",
        message: "Account deleted, goodbye",
      };
    },
  });
}

export function showResetAccountModal(): void {
  showConfirmModal({
    title: "Reset account",
    buttonText: "reset",
    confirmText: `I understand that my account will be completely reset and that this cannot be undone.`,
    action: async () => {
      showNoticeNotification("Resetting settings...");
      await resetConfig();
      await FileStorage.deleteFile("LocalBackgroundFile");
      await FileStorage.deleteFile("LocalFontFamilyFile");

      showNoticeNotification("Resetting account...");
      const response = await Ape.users.reset();
      if (response.status !== 200) {
        return {
          status: "error",
          message: "Failed to reset account",
          notificationOptions: { response },
        };
      }

      reloadAfter(3);

      return {
        status: "success",
        message: "Account reset",
      };
    },
  });
}

export function showResetPersonalBestsModal(): void {
  showConfirmModal({
    title: "Reset personal bests",
    buttonText: "reset",
    confirmText: `I understand that all my personal bests will be deleted and that this cannot be undone.`,
    action: async () => {
      const response = await Ape.users.deletePersonalBests();
      if (response.status !== 200) {
        return {
          status: "error",
          message: "Failed to reset personal bests",
          notificationOptions: { response },
        };
      }

      const snapshot = getSnapshot();
      if (!snapshot) {
        return {
          status: "error",
          message: "Failed to reset personal bests: no snapshot",
        };
      }

      snapshot.personalBests = {
        time: {},
        words: {},
        quote: {},
        zen: {},
        custom: {},
      };

      return {
        status: "success",
        message: "Personal bests reset",
      };
    },
  });
}

export function showRevokeAllTokensModal() {
  showConfirmModal({
    title: "Revoke all tokens",
    confirmText: `I understand that all my tokens will get revoked and that I will be logged out of all devices.`,
    buttonText: "revoke all",
    action: async () => {
      const response = await Ape.users.revokeAllTokens();
      if (response.status !== 200) {
        return {
          status: "error",
          message: "Failed to revoke tokens",
          notificationOptions: { response },
        };
      }

      reloadAfter(3);

      return {
        status: "success",
        message: "Tokens revoked",
      };
    },
  });
}

/**
 * A destructive action behind a confirmation checkbox. Clerk has no
 * reauthentication api, so the checkbox is the only gate.
 */
function showConfirmModal(options: {
  title: string;
  buttonText: string;
  confirmText: string;
  action: () => Promise<ExecReturn>;
}): void {
  if (!isAuthenticated()) return;

  showSimpleModal({
    title: options.title,
    buttonText: options.buttonText,
    schema: z.object({
      confirm: z.literal(true),
    }),
    inputs: {
      confirm: {
        type: "checkbox",
        label: options.confirmText,
      },
    },

    execFn: async () => options.action(),
  });
}
