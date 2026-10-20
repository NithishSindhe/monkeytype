import request from "supertest";
import app from "../../src/app";
import { clerkUid } from "./ids";
import { BearerAuthenticationMock, mockBearerAuthentication } from "./auth";
import { beforeEach } from "vitest";
import TestAgent from "supertest/lib/agent";

export function setup(): {
  mockApp: TestAgent;
  uid: string;
  mockAuth: BearerAuthenticationMock;
} {
  const mockApp = request(app);
  const uid = clerkUid();
  const mockAuth = mockBearerAuthentication(uid);

  beforeEach(() => {
    mockAuth.beforeEach();
  });

  return { mockApp, uid, mockAuth };
}
