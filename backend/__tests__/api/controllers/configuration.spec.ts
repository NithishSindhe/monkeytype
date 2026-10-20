import { describe, it, expect } from "vitest";
import { setup } from "../../__testData__/controller-test";
import { BASE_CONFIGURATION } from "../../../src/constants/base-configuration";

const { mockApp } = setup();

describe("Configuration Controller", () => {
  describe("getConfiguration", () => {
    it("should get without authentication", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp.get("/configuration").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Configuration retrieved",
        data: BASE_CONFIGURATION,
      });
    });
  });
});
