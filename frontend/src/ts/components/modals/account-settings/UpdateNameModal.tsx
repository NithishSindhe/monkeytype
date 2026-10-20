import { UserNameSchema } from "@monkeytype/schemas/users";
import { z } from "zod";

import Ape from "../../../ape";
import { setSnapshot, getSnapshot } from "../../../db";
import { isAuthenticated } from "../../../states/core";
import { showSimpleModal } from "../../../states/simple-modal";
import { remoteValidation } from "../../../utils/remote-validation";

export function showUpdateNameModal(): void {
  const snapshot = getSnapshot();
  if (!isAuthenticated() || !snapshot) return;

  showSimpleModal({
    title: "Update name",
    buttonText: "update",
    text: snapshot.needsToChangeName
      ? "You need to change your account name. This might be because you have a duplicate name, no account name or your name is not allowed (contains whitespace or invalid characters). Sorry for the inconvenience."
      : undefined,
    schema: z.object({
      newName: UserNameSchema,
    }),
    inputs: {
      newName: {
        placeholder: "new name",
        type: "text",
        validation: {
          isValid: remoteValidation(
            async (name: string) =>
              Ape.users.getNameAvailability({ params: { name } }),
            { check: (data) => data.available || "Name not available" },
          ),
          debounceDelay: 1000,
        },
      },
    },

    execFn: async ({ newName }) => {
      const response = await Ape.users.updateName({
        body: { name: newName },
      });
      if (response.status !== 200) {
        return {
          status: "error",
          message: "Failed to update name",
          notificationOptions: { response },
        };
      }

      snapshot.name = newName;

      setSnapshot(snapshot);

      return {
        status: "success",
        message: "Name updated",
      };
    },
  });
}
