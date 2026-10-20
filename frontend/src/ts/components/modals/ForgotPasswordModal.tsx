import { UserEmailSchema } from "@monkeytype/schemas/users";
import { tryCatch } from "@monkeytype/util/trycatch";
import { createForm } from "@tanstack/solid-form";
import { createSignal, Show } from "solid-js";

import { getPasswordSchema } from "../../auth";
import { getSignIn, setActiveSession } from "../../auth-client";
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

/**
 * Clerk's password reset: request a code by email, then submit the code
 * together with the new password (which signs the user in).
 */
export function ForgotPasswordModal() {
  const [needsCode, setNeedsCode] = createSignal(false);

  const emailForm = createForm(() => ({
    defaultValues: {
      email: "",
    },
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    onSubmit: async ({ value }) => {
      if (await requestReset(value.email)) setNeedsCode(true);
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  const resetForm = createForm(() => ({
    defaultValues: {
      code: "",
      password: "",
    },
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    onSubmit: async ({ value }) => {
      if (await applyReset(value.code, value.password)) {
        resetForm.reset();
        emailForm.reset();
        setNeedsCode(false);
      }
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  return (
    <AnimatedModal
      id="ForgotPassword"
      title="Forgot password"
      mode="dialog"
      afterHide={() => {
        setNeedsCode(false);
      }}
    >
      <Show
        when={!needsCode()}
        fallback=<form
          class="flex flex-col justify-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void resetForm.handleSubmit();
          }}
        >
          <p class="text-sm text-sub">
            Enter the code we emailed you and your new password.
          </p>
          <resetForm.Field
            name="code"
            children={(field) => (
              <InputField
                field={field}
                placeholder="verification code"
                autocomplete="one-time-code"
              />
            )}
          />
          <resetForm.Field
            name="password"
            validators={{
              onChange: fromSchema(getPasswordSchema({ isNew: true })),
            }}
            children={(field) => (
              <InputField
                field={field}
                placeholder="new password"
                type="password"
                autocomplete="new-password"
              />
            )}
          />
          <SubmitButton form={resetForm} text="set new password" />
        </form>
      >
        <form
          class="flex flex-col justify-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void emailForm.handleSubmit();
          }}
        >
          <emailForm.Field
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

          <SubmitButton form={emailForm} text="request password reset" />
        </form>
      </Show>
    </AnimatedModal>
  );
}

async function requestReset(email: string): Promise<boolean> {
  const trimmed = email.trim();
  if (trimmed === "") {
    showNoticeNotification("Please enter your email address");
    return false;
  }

  const signIn = getSignIn();
  if (signIn === undefined) {
    showErrorNotification("Authentication uninitialized");
    return false;
  }

  showLoaderBar();
  const { error } = await tryCatch(
    signIn.create({
      strategy: "reset_password_email_code",
      identifier: trimmed,
    }),
  );
  hideLoaderBar();

  if (error) {
    showErrorNotification("Failed to send password reset email", { error });
    return false;
  }

  showSuccessNotification(
    "Password reset request received. If the email is valid, you will receive a code shortly.",
    { durationMs: 5000 },
  );
  return true;
}

async function applyReset(code: string, password: string): Promise<boolean> {
  const signIn = getSignIn();
  if (signIn === undefined) {
    showErrorNotification("Authentication uninitialized");
    return false;
  }

  showLoaderBar();
  const { data: result, error } = await tryCatch(
    signIn.attemptFirstFactor({
      strategy: "reset_password_email_code",
      code,
      password,
    }),
  );
  hideLoaderBar();

  if (error) {
    showErrorNotification("Failed to reset password", { error });
    return false;
  }

  if (result.status !== "complete" || result.createdSessionId === null) {
    showErrorNotification(
      "Password reset could not be completed. Please try again.",
    );
    return false;
  }

  await setActiveSession(result.createdSessionId);
  showSuccessNotification("Password updated");
  hideModal("ForgotPassword");
  return true;
}
