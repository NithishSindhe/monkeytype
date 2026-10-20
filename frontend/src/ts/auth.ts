import { NewPasswordSchema, PasswordSchema } from "@monkeytype/schemas/users";
import { tryCatch } from "@monkeytype/util/trycatch";
import { z, ZodString } from "zod";

import Ape from "./ape";
import {
  AuthUser,
  createUserWithEmailAndPassword,
  getAuthenticatedUser,
  getSignIn,
  getSignUp,
  isAuthAvailable,
  resetIgnoreAuthCallback,
  setActiveSession,
  setUserState,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut as authSignOut,
} from "./auth-client";
import { waitForPresetsReady } from "./collections/presets";
import { waitForTagsReady } from "./collections/tags";
import { updateFromServer as updateConfigFromServer } from "./config/remote";
import * as DB from "./db";
import { authEvent } from "./events/auth";
import { pickUsernameEvent } from "./events/pick-username";
import * as Sentry from "./sentry";
import { isAuthenticated, setUserId } from "./states/core";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "./states/notifications";
import { isDevEnvironment } from "./utils/env";
import { createErrorMessage } from "./utils/error";
import { SnapshotInitError } from "./utils/snapshot-init-error";

export { getAuthenticatedUser };

/**
 * The backend answers `GET /users` with this message (404) when the Clerk user
 * has no Monkeytype profile yet, ie. they still have to pick a username.
 */
const NO_PROFILE_MESSAGE = "please pick a username";

/** The result of a sign in / sign up step. */
export type AuthResult =
  | { status: "success" }
  /** Clerk wants the code it emailed: continue with `submitEmailCode`. */
  | { status: "needsEmailCode" }
  | { status: "error"; message: string };

/** The username the pending sign up will create the Monkeytype user with. */
let pendingSignUpName: string | undefined;

type UserDataResult = "ok" | "needsUsername" | "failed";

async function getDataAndInit(): Promise<UserDataResult> {
  try {
    console.log("getting account data");
    const snapshot = await DB.initSnapshot();
    //TODO: preload collections for now, remove when __nonReactive is removed from collections
    await waitForPresetsReady();
    await waitForTagsReady();

    if (snapshot === false) {
      throw new Error(
        "Snapshot didn't initialize due to lacking authentication even though user is authenticated",
      );
    }

    void Sentry.setUser(snapshot.uid, snapshot.name);

    await updateConfigFromServer();
    return "ok";
  } catch (error) {
    console.error(error);
    if (error instanceof SnapshotInitError) {
      // the Clerk user has no Monkeytype profile yet: finish signing up
      // instead of signing them out
      if (
        error.responseCode === 404 &&
        error.message.includes(NO_PROFILE_MESSAGE)
      ) {
        return "needsUsername";
      }

      if (error.responseCode === 429) {
        showNoticeNotification(
          "Doing so will save you bandwidth, make the next test be ready faster and will not sign you out (which could mean your new personal best would not save to your account).",
          {
            durationMs: 0,
          },
        );
        showNoticeNotification(
          "You will run into this error if you refresh the website to restart the test. It is NOT recommended to do that. Instead, use tab + enter or just tab (with quick tab mode enabled) to restart the test.",
          {
            durationMs: 0,
          },
        );
      }

      showErrorNotification(`Failed to get user data: ${error.message}`);
    } else {
      showErrorNotification("Failed to get user data", { error });
    }
    return "failed";
  }
}

export async function loadUser(_user: AuthUser): Promise<void> {
  const result = await getDataAndInit();
  if (result === "needsUsername") {
    // the pick username modal creates the profile and calls loadUser again
    pickUsernameEvent.dispatch();
    return;
  }
  if (result === "failed") {
    signOut();
    return;
  }
  authEvent.dispatch({ type: "snapshotUpdated", data: { isInitial: true } });
}

export async function onAuthStateChanged(
  authInitialisedAndConnected: boolean,
  user: AuthUser | null,
): Promise<void> {
  console.debug(`account controller ready`);

  let userPromise: Promise<void> = Promise.resolve();

  if (authInitialisedAndConnected) {
    console.debug(`auth state changed, user ${user ? "true" : "false"}`);
    if (user) {
      setUserId(user.uid);
      userPromise = loadUser(user);
    } else {
      setUserId(null);
      DB.setSnapshot(undefined);
    }
  }

  if (!authInitialisedAndConnected || !user) {
    void Sentry.clearUser();
  }

  dispatchAuthStateChanged(user, userPromise);
}

/**
 * Announces a new auth state: `user` signed in (null: signed out), with
 * `loadPromise` downloading their user data.
 */
export function dispatchAuthStateChanged(
  user: AuthUser | null,
  loadPromise: Promise<void>,
): void {
  authEvent.dispatch({
    type: "authStateChanged",
    data: {
      isUserSignedIn: user !== null,
      loadPromise,
      reloadUserData: async () => {
        if (user !== null) await loadUser(user);
      },
    },
  });
}

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<AuthResult> {
  if (!isAuthAvailable()) {
    return { status: "error", message: "Authentication uninitialized" };
  }

  const { data: attempt, error } = await tryCatch(
    signInWithEmailAndPassword(email, password, rememberMe),
  );

  if (error !== null) {
    return { status: "error", message: translateClerkError(error) };
  }

  if (attempt.status === "complete") {
    return activateSession(attempt.createdSessionId);
  }

  // password alone wasn't enough (eg. the account only has email codes):
  // ask Clerk to email a code
  if (attempt.status === "needs_first_factor") {
    const { error: prepareError } = await tryCatch(
      prepareSignInEmailCode(email),
    );
    if (prepareError !== null) {
      return { status: "error", message: translateClerkError(prepareError) };
    }
    return { status: "needsEmailCode" };
  }

  return {
    status: "error",
    message: `Sign in could not be completed (${attempt.status ?? "unknown"})`,
  };
}

async function prepareSignInEmailCode(email: string): Promise<void> {
  const attempt = getSignIn();
  if (attempt === undefined) throw new Error("Authentication uninitialized");

  const factor = attempt.supportedFirstFactors?.find(
    (it) => it.strategy === "email_code",
  );
  if (factor === undefined || !("emailAddressId" in factor)) {
    throw new Error(
      `No verification method available for ${email}. Try signing in with Google instead.`,
    );
  }

  await attempt.prepareFirstFactor({
    strategy: "email_code",
    emailAddressId: factor.emailAddressId,
  });
}

/**
 * Submits the code Clerk emailed, for whichever of the two flows is pending:
 * a sign in's first factor, or a sign up's email verification.
 */
export async function submitEmailCode(code: string): Promise<AuthResult> {
  if (pendingSignUpName !== undefined) return completeSignUp(code);

  const attempt = getSignIn();
  if (attempt === undefined) {
    return { status: "error", message: "Authentication uninitialized" };
  }

  const { data: result, error } = await tryCatch(
    attempt.attemptFirstFactor({ strategy: "email_code", code }),
  );
  if (error !== null) {
    return { status: "error", message: translateClerkError(error) };
  }
  if (result.status !== "complete") {
    return { status: "error", message: "Incorrect code" };
  }
  return activateSession(result.createdSessionId);
}

async function activateSession(sessionId: string | null): Promise<AuthResult> {
  if (sessionId === null) {
    return { status: "error", message: "Sign in did not create a session" };
  }
  const { error } = await tryCatch(setActiveSession(sessionId));
  if (error !== null) {
    return { status: "error", message: translateClerkError(error) };
  }
  return { status: "success" };
}

/** Sends the browser to Google; it comes back on `/sso-callback`. */
export async function signInWithProvider(
  authMethod: "google",
  options: { rememberMe: boolean },
): Promise<AuthResult> {
  void authMethod;
  if (!isAuthAvailable()) {
    return { status: "error", message: "Authentication uninitialized" };
  }

  const { error } = await tryCatch(
    signInWithRedirect("oauth_google", options.rememberMe),
  );

  if (error !== null) {
    return { status: "error", message: translateClerkError(error) };
  }
  return { status: "success" };
}

export function signOut(): void {
  if (!isAuthAvailable()) {
    showErrorNotification("Authentication uninitialized", { durationMs: 3000 });
    return;
  }
  if (!isAuthenticated()) return;
  void authSignOut();
}

/**
 * Starts a sign up: Clerk creates the account and emails a code, which
 * `submitEmailCode` then completes (creating the Monkeytype user).
 */
export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!isAuthAvailable()) {
    return { status: "error", message: "Authentication uninitialized" };
  }

  try {
    await createUserWithEmailAndPassword(email, password);
    const attempt = getSignUp();
    if (attempt === undefined) throw new Error("Authentication uninitialized");
    await attempt.prepareEmailAddressVerification({ strategy: "email_code" });
    pendingSignUpName = name;
    return { status: "needsEmailCode" };
  } catch (e) {
    const message = translateClerkError(e);
    resetIgnoreAuthCallback();
    pendingSignUpName = undefined;
    return { status: "error", message };
  }
}

async function completeSignUp(code: string): Promise<AuthResult> {
  const name = pendingSignUpName;
  const attempt = getSignUp();
  if (name === undefined || attempt === undefined) {
    return { status: "error", message: "No sign up in progress" };
  }

  try {
    const result = await attempt.attemptEmailAddressVerification({ code });
    if (result.status !== "complete" || result.createdSessionId === null) {
      return { status: "error", message: "Incorrect code" };
    }

    // the session has to be active before the backend accepts the signup
    await setActiveSession(result.createdSessionId);
    await createMonkeytypeUser(name);

    pendingSignUpName = undefined;
    showSuccessNotification("Account created");
    return { status: "success" };
  } catch (e) {
    const message = translateClerkError(e);
    showErrorNotification(message);
    pendingSignUpName = undefined;
    resetIgnoreAuthCallback();
    signOut();
    return { status: "error", message };
  }
}

/**
 * Creates the Monkeytype profile for the signed in Clerk user and announces
 * the new auth state (suppressed until now by the sign up).
 */
export async function createMonkeytypeUser(name: string): Promise<void> {
  const response = await Ape.users.create({ body: { name } });
  if (response.status !== 200) {
    throw new Error(`Failed to create user: ${response.body.message}`);
  }

  const user = getAuthenticatedUser();
  if (user === null) throw new Error("User is not signed in");

  setUserState(user);
  resetIgnoreAuthCallback();
  await onAuthStateChanged(true, user);
}

/**
 * Returns the Zod schema for password validation.
 *
 * Set `isNew: true` for registration/creation flows (strict rules).
 * Omit it for flows that only need a non-empty password.
 *
 * @param options - Set `isNew: true` for password creation/registration.
 * @returns A Zod string schema.
 */
export function getPasswordSchema(options?: { isNew: boolean }): ZodString {
  if (!options?.isNew) return PasswordSchema;
  if (isDevEnvironment()) return z.string().min(6);
  return NewPasswordSchema;
}

/** Turns a Clerk error into something worth showing the user. */
function translateClerkError(error: unknown): string {
  const clerkErrors = (
    error as { errors?: { longMessage?: string; message?: string }[] }
  ).errors;
  const first = clerkErrors?.[0];
  if (first !== undefined) {
    return first.longMessage ?? first.message ?? "Authentication failed";
  }
  return createErrorMessage(error, "Authentication failed");
}
