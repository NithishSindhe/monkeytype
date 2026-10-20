import { createClerkClient, type ClerkClient } from "@clerk/backend";

let client: ClerkClient | undefined;

/** The Clerk client, created on first use. */
export default function Clerk(): ClerkClient {
  if (client !== undefined) return client;

  const secretKey = process.env["CLERK_SECRET_KEY"];
  if (secretKey === undefined || secretKey === "") {
    throw new Error("CLERK_SECRET_KEY is not set");
  }

  client = createClerkClient({
    secretKey,
    publishableKey: process.env["CLERK_PUBLISHABLE_KEY"],
  });

  return client;
}
