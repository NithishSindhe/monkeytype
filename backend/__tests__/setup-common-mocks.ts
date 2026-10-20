import { vi } from "vitest";

export function setupCommonMocks(): void {
  vi.mock("../src/utils/logger", () => ({
    __esModule: true,
    default: {
      error: console.error,
      warning: console.warn,
      info: console.info,
      success: console.info,
      logToDb: console.info,
    },
  }));

  // the clerk client needs a secret key and talks to the network, so it never
  // gets built in tests. Anything that needs clerk goes through src/utils/auth,
  // which the tests spy on.
  vi.mock("../src/init/clerk", () => ({
    __esModule: true,
    default: () => {
      throw new Error("Clerk is not available in tests");
    },
  }));

  vi.mock("../src/utils/auth", () => ({
    __esModule: true,
    verifySessionToken: vi.fn(async () =>
      Promise.resolve({
        uid: "mockUid",
        email: "mockUser@example.com",
        issuedAt: 0,
      }),
    ),
    getUserEmail: vi.fn(async () => Promise.resolve("mockUser@example.com")),
    deleteUser: vi.fn(async () => Promise.resolve()),
    revokeTokensByUid: vi.fn(async () => Promise.resolve()),
  }));
}
