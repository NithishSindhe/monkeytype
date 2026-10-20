import { UserEmailSchema } from "@monkeytype/schemas/users";
import { tryCatch } from "@monkeytype/util/trycatch";
import { createForm } from "@tanstack/solid-form";

import { sendPasswordResetEmail } from "../../firebase";
import { hideLoaderBar, showLoaderBar } from "../../states/loader-bar";
import { hideModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { AnimatedModal } from "../common/AnimatedModal";
import { InputField } from "../ui/form/InputField";
import { SubmitButton } from "../ui/form/SubmitButton";
import { allFieldsMandatory, fromSchema } from "../ui/form/utils";

export function ForgotPasswordModal() {
  const form = createForm(() => ({
    defaultValues: {
      email: "",
    },
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    onSubmit: async ({ value }) => {
      await apply(value);
      form.reset();
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  return (
    <AnimatedModal id="ForgotPassword" title="Forgot password" mode="dialog">
      <form
        class="flex flex-col justify-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{
            onChange: fromSchema(UserEmailSchema, {
              convert: (it) => it?.trim(),
            }),
          }}
          children={(field) => (
            <InputField field={field} placeholder="email" type="email" />
          )}
        />

        <SubmitButton form={form} text="request password reset" />
      </form>
    </AnimatedModal>
  );
}

async function apply(options: { email: string }): Promise<void> {
  const { email } = options;

  if (email === undefined || email === "") {
    showNoticeNotification("Please enter your email address");
    return;
  }

  showLoaderBar();
  const { error } = await tryCatch(sendPasswordResetEmail(email));
  hideLoaderBar();

  if (error) {
    showErrorNotification("Failed to send password reset email", { error });
    return;
  }

  showSuccessNotification(
    "Password reset request received. If the email is valid, you will receive an email shortly.",
    { durationMs: 5000 },
  );

  hideModal("ForgotPassword");
}
