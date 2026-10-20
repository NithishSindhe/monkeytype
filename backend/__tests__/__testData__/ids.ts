import { randomUUID } from "crypto";

/**
 * A Clerk user id. Clerk ids look like `user_2abcDEF...`, they are opaque
 * strings and, unlike the row ids, they are not uuids.
 */
export function clerkUid(): string {
  return `user_${randomUUID().replaceAll("-", "")}`;
}

/** A row id. Every id the database hands out is a uuid. */
export function rowId(): string {
  return randomUUID();
}
