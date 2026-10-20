import { verifyToken } from "@clerk/backend";
import Clerk from "../init/clerk";
import MonkeyError from "./error";

export type DecodedClerkToken = {
  uid: string;
  email: string;
  /** when the token was issued, in milliseconds */
  issuedAt: number;
};

/**
 * Verifies a Clerk session token.
 * Clerk tokens are short lived (about a minute), so there is nothing to cache.
 */
export async function verifySessionToken(
  token: string,
): Promise<DecodedClerkToken> {
  const secretKey = process.env["CLERK_SECRET_KEY"];
  if (secretKey === undefined || secretKey === "") {
    throw new MonkeyError(500, "CLERK_SECRET_KEY is not set");
  }

  const payload = await verifyToken(token, { secretKey });

  const uid = payload.sub;
  if (uid === undefined || uid === "") {
    throw new MonkeyError(401, "Token has no subject");
  }

  return {
    uid,
    email: readEmail(payload),
    issuedAt: payload.iat * 1000,
  };
}

/**
 * The email from the token when the session claims carry one, otherwise an
 * empty string. The signup flow reads it from Clerk directly instead.
 */
function readEmail(payload: { [key: string]: unknown }): string {
  const email = payload["email"] ?? payload["primary_email_address"];
  return typeof email === "string" ? email : "";
}

/** The user's primary email address, read from Clerk. */
export async function getUserEmail(uid: string): Promise<string> {
  const user = await Clerk().users.getUser(uid);
  const primary = user.emailAddresses.find(
    (it) => it.id === user.primaryEmailAddressId,
  );
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
}

/** Removes the account from Clerk. Used when deleting a Monkeytype account. */
export async function deleteUser(uid: string): Promise<void> {
  await Clerk().users.deleteUser(uid);
}

/** Signs the user out everywhere by revoking their Clerk sessions. */
export async function revokeTokensByUid(uid: string): Promise<void> {
  const { data: sessions } = await Clerk().sessions.getSessionList({
    userId: uid,
  });

  await Promise.all(
    sessions
      .filter((session) => session.status === "active")
      .map(async (session) => Clerk().sessions.revokeSession(session.id)),
  );
}
