import { createForm } from "@tanstack/solid-form";
import { createSignal, JSXElement, Show } from "solid-js";

import {
  AuthResult,
  signIn,
  signInWithProvider,
  submitEmailCode,
} from "../../../auth";
import {
  disableLoginPageInputs,
  enableLoginPageInputs,
  getLoginPageInputsEnabled,
} from "../../../states/login";
import { showModal } from "../../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
} from "../../../states/notifications";
import { Button } from "../../common/Button";
import { H3 } from "../../common/Headers";
import { Separator } from "../../common/Separator";
import { Checkbox } from "../../ui/form/Checkbox";
import { InputField } from "../../ui/form/InputField";
import { SubmitButton } from "../../ui/form/SubmitButton";
import { allFieldsMandatory } from "../../ui/form/utils";

export function Login(): JSXElement {
  // Clerk asked for the code it emailed: the form swaps to a code entry step
  const [needsEmailCode, setNeedsEmailCode] = createSignal(false);

  const trySignIn = async (
    auth: () => Promise<AuthResult>,
    label?: string,
  ): Promise<void> => {
    disableLoginPageInputs();
    try {
      const data = await auth();
      if (data.status === "needsEmailCode") {
        setNeedsEmailCode(true);
        showNoticeNotification("We emailed you a verification code");
        return;
      }
      if (data.status === "error") {
        showErrorNotification(
          `Failed to sign in${label !== undefined ? ` with ${label}` : ""}: ${data.message}`,
        );
      }
    } finally {
      enableLoginPageInputs();
    }
  };

  const form = createForm(() => ({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true,
    },
    onSubmit: async ({ value }) =>
      await trySignIn(async () =>
        signIn(value.email, value.password, value.rememberMe),
      ),
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  const codeForm = createForm(() => ({
    defaultValues: {
      code: "",
    },
    onSubmit: async ({ value }) =>
      await trySignIn(async () => submitEmailCode(value.code)),
    onSubmitInvalid: () => {
      showNoticeNotification("Please fill in all fields");
    },
    validators: {
      onChange: allFieldsMandatory(),
    },
  }));

  return (
    <div class="grid w-full grid-cols-1 justify-center gap-2 sm:w-80">
      <H3
        text="login"
        fa={{
          icon: "fa-sign-in-alt",
        }}
        class="p-0"
      />
      <Show
        when={!needsEmailCode()}
        fallback=<form
          class="grid w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void codeForm.handleSubmit();
          }}
        >
          <p class="text-sm text-sub">
            Enter the verification code we emailed you.
          </p>
          <codeForm.Field
            name="code"
            children={(field) => (
              <InputField
                field={field}
                placeholder="verification code"
                autocomplete="one-time-code"
                disabled={!getLoginPageInputsEnabled()}
              />
            )}
          />
          <SubmitButton
            form={codeForm}
            fa={{ icon: "fa-sign-in-alt" }}
            text="verify"
            disabled={!getLoginPageInputsEnabled()}
          />
        </form>
      >
        <Button
          fa={{ icon: "fa-google", variant: "brand" }}
          text="sign in with google"
          onClick={() =>
            void trySignIn(
              async () =>
                signInWithProvider("google", {
                  rememberMe: form.getFieldValue("rememberMe"),
                }),
              "Google",
            )
          }
          disabled={!getLoginPageInputsEnabled()}
        />
        <form
          class="grid w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Separator text="or" />
          <form.Field
            name="email"
            children={(field) => (
              <InputField
                field={field}
                placeholder="email"
                autocomplete="current-email"
                disabled={!getLoginPageInputsEnabled()}
              />
            )}
          />
          <form.Field
            name="password"
            children={(field) => (
              <InputField
                field={field}
                placeholder="password"
                type="password"
                autocomplete="current-password"
                disabled={!getLoginPageInputsEnabled()}
              />
            )}
          />
          <form.Field
            name="rememberMe"
            children={(field) => (
              <Checkbox
                field={field}
                disabled={!getLoginPageInputsEnabled()}
                label="remember me"
              />
            )}
          />

          <SubmitButton
            form={form}
            fa={{ icon: "fa-sign-in-alt" }}
            text="sign in"
            disabled={!getLoginPageInputsEnabled()}
          />
        </form>

        <Button
          text="forgot password?"
          variant="text"
          class="text justify-end text-xs"
          onClick={() => showModal("ForgotPassword")}
          disabled={!getLoginPageInputsEnabled()}
        />
      </Show>
    </div>
  );
}
