import { expect, vi } from "vitest";
import * as AuthUtils from "../../src/utils/auth";
import type { DecodedClerkToken } from "../../src/utils/auth";

export type BearerAuthenticationMock = {
  /**
   * Reset the mock and return a default token. Call this method in the `beforeEach` of all tests.
   */
  beforeEach: () => void;
  /**
   * Reset the mock results in the authentication to fail.
   */
  noAuth: () => void;
  /**
   * verify the authentication has been called
   */
  expectToHaveBeenCalled: () => void;
  /**
   * modify the token returned by the mock. This can be used to e.g. return a stale token.
   * @param customize
   */
  modifyToken: (customize: Partial<DecodedClerkToken>) => void;
};
export function mockBearerAuthentication(
  uid: string,
): BearerAuthenticationMock {
  const mockDecodedToken: DecodedClerkToken = {
    uid,
    email: "newuser@mail.com",
    issuedAt: Date.now(),
  };
  const verifySessionTokenMock = vi.spyOn(AuthUtils, "verifySessionToken");

  return {
    beforeEach: (): void => {
      verifySessionTokenMock.mockClear();
      verifySessionTokenMock.mockResolvedValue(mockDecodedToken);
    },

    noAuth: (): void => {
      verifySessionTokenMock.mockClear();
    },

    expectToHaveBeenCalled: (): void => {
      expect(verifySessionTokenMock).toHaveBeenCalled();
    },

    modifyToken: (customize: Partial<DecodedClerkToken>): void => {
      verifySessionTokenMock.mockClear();
      verifySessionTokenMock.mockResolvedValue({
        ...mockDecodedToken,
        ...customize,
      });
    },
  };
}
