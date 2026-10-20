import { createEvent } from "../hooks/createEvent";

/**
 * Dispatched when a signed in Clerk user has no Monkeytype profile yet:
 * `PickUsernameModal` asks for a username and creates the profile.
 */
export const pickUsernameEvent = createEvent();
