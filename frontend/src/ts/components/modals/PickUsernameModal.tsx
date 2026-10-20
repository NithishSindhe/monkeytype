import { UserNameSchema } from "@monkeytype/schemas/users";
import { createForm } from "@tanstack/solid-form";

import Ape from "../../ape";
import { createMonkeytypeUser, signOut } from "../../auth";
import { pickUsernameEvent } from "../../events/pick-username";
import { hideLoaderBar, showLoaderBar } from "../../states/loader-bar";
import { hideModal, ModalId, showModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { remoteValidationForm } from "../../utils/remote-validation";
import { AnimatedModal } from "../common/AnimatedModal";
import { InputField } from "../ui/form/InputField";
import { SubmitButton } from "../ui/form/SubmitButton";
import { allFieldsMandatory, fromSchema } from "../ui/form/utils";

const modalId: ModalId = "PickUsername";

/** True until the username was accepted: hiding the modal then cancels sign up. */
let isPending = false;

/**
 * Asks a signed in Clerk user without a Monkeytype profile (a fresh Google
 * sign in, or a sign up that never finished) for a username, then creates
 * the profile.
 */
export function PickUsernameModal() {
  const form = createForm(() => ({
    defaultValues: {
      username: "",
    },
    onSubmit: async ({ value }) => apply(value),
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  return (
    <AnimatedModal
      id={modalId}
      title="Account name"
      mode="dialog"
      afterHide={() => afterHide()}
    >
      <p>Please enter a username before continuing</p>
      <form
        class="flex flex-col justify-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="username"
          validators={{
            onChange: fromSchema(UserNameSchema),
            onChangeAsyncDebounceMs: 1000,
            onChangeAsync: remoteValidationForm(
              async (name: string) =>
                Ape.users.getNameAvailability({ params: { name } }),
              { check: (data) => data.available || "Name not available" },
            ),
          }}
          children={(field) => (
            <InputField field={field} placeholder="username" type="input" />
          )}
        />

        <SubmitButton form={form} text="continue" />
      </form>
    </AnimatedModal>
  );
}

function afterHide(): void {
  if (!isPending) return;
  isPending = false;
  // the Clerk account stays (it is shared with other apps), only the
  // half-finished Monkeytype sign up is dropped
  showNoticeNotification("Sign up process cancelled", { durationMs: 5000 });
  signOut();
}

async function apply(options: { username: string }): Promise<void> {
  const { username: name } = options;

  showLoaderBar();
  try {
    if (name.length === 0) throw new Error("Name cannot be empty");
    await createMonkeytypeUser(name);
    isPending = false;
    showSuccessNotification("Account created");
    hideModal(modalId);
  } catch (e) {
    console.log(e);
    showErrorNotification("Failed to finish signing up", { error: e });
  } finally {
    hideLoaderBar();
  }
}

pickUsernameEvent.subscribe(() => {
  isPending = true;
  showModal(modalId);
});
