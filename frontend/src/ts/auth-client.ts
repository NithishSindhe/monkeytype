// Clerk-backed auth client. The rest of the app only talks to Clerk through
// this module (and `auth.tsx` for the sign in / sign up flows).

import { Clerk } from "@clerk/clerk-js";
import { envConfig } from "virtual:env-config";

import { addBanner } from "./states/banners";
import { setUserId, setUserVerified } from "./states/core";
import { isDevEnvironment } from "./utils/env";
import { promiseWithResolvers } from "./utils/misc";

/** The subset of the signed in Clerk user the app reads. */
export type AuthUser = {
  /** The Clerk user id, used as the Monkeytype uid. */
  uid: string;
  email: string | null;
  /** Clerk verifies the email during sign up, so this is true for every signed in user. */
  emailVerified: boolean;
};

// derived from the Clerk instance so the types always match the installed
// @clerk/clerk-js (importing @clerk/types directly risks a version skew)
type ClerkClient = NonNullable<Clerk["client"]>;
export type SignInResource = ClerkClient["signIn"];
export type SignUpResource = ClerkClient["signUp"];
type OAuthStrategy = Parameters<
  SignInResource["authenticateWithRedirect"]
>[0]["strategy"];

let clerk: Clerk | undefined;

/**
 * Ignore the Clerk listener. Used while signing up, where the backend user has
 * to be created before the app may react to the new session.
 */
let ignoreAuthCallback = false;

export type ReadyCallback = (
  success: boolean,
  user: AuthUser | null,
) => Promise<void>;

const { promise: authPromise, resolve: resolveAuthPromise } =
  promiseWithResolvers();

function toAuthUser(user: Clerk["user"]): AuthUser | null {
  if (user === null || user === undefined) return null;
  return {
    uid: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    emailVerified: true,
  };
}

export async function init(callback: ReadyCallback): Promise<void> {
  try {
    if (envConfig.clerkPublishableKey === "") {
      throw new Error("CLERK_PUBLISHABLE_KEY is not set");
    }

    const instance = new Clerk(envConfig.clerkPublishableKey);
    await instance.load({ signInUrl: "/login", signUpUrl: "/login" });
    clerk = instance;

    // the first state is announced here, so the listener (which Clerk also
    // fires right away) only has to report later changes
    const initialUser = toAuthUser(instance.user);
    let lastUserId: string | null = initialUser?.uid ?? null;

    instance.addListener(({ user }) => {
      const authUser = toAuthUser(user);
      // Clerk emits on every resource change; only react to sign in / sign out
      const userId = authUser?.uid ?? null;
      if (userId === lastUserId) return;
      lastUserId = userId;
      if (ignoreAuthCallback) return;
      setUserState(authUser);
      void callback(true, authUser);
    });

    setUserState(initialUser);
    await callback(true, initialUser);
  } catch (e) {
    clerk = undefined;
    console.error("Clerk failed to initialize", e);
    await callback(false, null);
    setUserState(null);
    if (isDevEnvironment()) {
      addBanner({
        level: "notice",
        text: "Dev Info: Clerk failed to initialize",
        icon: "fas fa-exclamation-triangle",
      });
    }
  } finally {
    resolveAuthPromise();
  }
}

/** The loaded Clerk instance, or undefined when auth failed to initialize. */
export function getClerk(): Clerk | undefined {
  return clerk;
}

/**
 * @returns the current user if authenticated, else `null`
 */
export function getAuthenticatedUser(): AuthUser | null {
  return toAuthUser(clerk?.user);
}

export function isAuthAvailable(): boolean {
  return clerk !== undefined;
}

export async function signOut(): Promise<void> {
  console.log("auth signout");
  await clerk?.signOut();
}

/** The in-progress sign in attempt (eg. waiting for an email code). */
export function getSignIn(): SignInResource | undefined {
  return clerk?.client?.signIn;
}

/** The in-progress sign up attempt (eg. waiting for an email code). */
export function getSignUp(): SignUpResource | undefined {
  return clerk?.client?.signUp;
}

/**
 * Starts an email + password sign in. Clerk owns the session persistence, so
 * `rememberMe` is accepted for call site compatibility but has no effect.
 */
export async function signInWithEmailAndPassword(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<SignInResource> {
  void rememberMe;
  const signIn = getSignIn();
  if (clerk === undefined || signIn === undefined) {
    throw new Error("Authentication uninitialized");
  }

  return signIn.create({ identifier: email, password });
}

/** Activates the session a completed sign in / sign up attempt created. */
export async function setActiveSession(sessionId: string): Promise<void> {
  if (clerk === undefined) throw new Error("Authentication uninitialized");
  await clerk.setActive({ session: sessionId });
}

export function setUserState(
  options: {
    uid: string;
    emailVerified: boolean;
  } | null,
): void {
  if (options === null) {
    setUserId(null);
    setUserVerified(false);
  } else {
    setUserId(options.uid);
    setUserVerified(options.emailVerified);
  }
}

/**
 * Sign in (or up) with an SSO provider. Clerk sends the browser to the
 * provider and back to `/sso-callback` (see `router/routes.ts`), so this
 * never resolves on success.
 */
export async function signInWithRedirect(
  strategy: OAuthStrategy,
  rememberMe: boolean,
): Promise<void> {
  void rememberMe;
  const signIn = getSignIn();
  if (clerk === undefined || signIn === undefined) {
    throw new Error("Authentication uninitialized");
  }

  await signIn.authenticateWithRedirect({
    strategy,
    redirectUrl: `${window.location.origin}/sso-callback`,
    redirectUrlComplete: `${window.location.origin}/`,
  });
}

/** Finishes an SSO redirect. Resolves once Clerk activated the session. */
export async function handleRedirectCallback(): Promise<void> {
  if (clerk === undefined) throw new Error("Authentication uninitialized");
  await clerk.handleRedirectCallback({
    signInFallbackRedirectUrl: "/",
    signUpFallbackRedirectUrl: "/",
  });
}

/**
 * Starts an email + password sign up. The caller has to verify the email code
 * and create the Monkeytype user before the session may be activated.
 */
export async function createUserWithEmailAndPassword(
  email: string,
  password: string,
): Promise<SignUpResource> {
  const signUp = getSignUp();
  if (clerk === undefined || signUp === undefined) {
    throw new Error("Authentication uninitialized");
  }
  ignoreAuthCallback = true;

  return signUp.create({ emailAddress: email, password });
}

/** Opens Clerk's user profile popup (email, password and connected accounts). */
export function openUserProfile(): void {
  if (clerk === undefined) throw new Error("Authentication uninitialized");
  clerk.openUserProfile();
}

export async function getIdToken(): Promise<string | null> {
  return (await clerk?.session?.getToken()) ?? null;
}

export function resetIgnoreAuthCallback(): void {
  ignoreAuthCallback = false;
}

export { authPromise };
