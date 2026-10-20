import { vi } from "vitest";
vi.mock("../../src/ts/auth-client", () => ({
  getClerk: () => undefined,
  isAuthAvailable: () => false,
  getAuthenticatedUser: () => null,
  getIdToken: async () => null,
}));
