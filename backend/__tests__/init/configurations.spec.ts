import { describe, it, expect } from "vitest";
import * as Configurations from "../../src/init/configuration";

import { Configuration } from "@monkeytype/schemas/configuration";
const mergeConfigurations = Configurations.__testing.mergeConfigurations;

describe("configurations", () => {
  describe("mergeConfigurations", () => {
    it("should merge configurations correctly", () => {
      //GIVEN
      const baseConfig: Configuration = {
        maintenance: false,
        dev: {
          responseSlowdownMs: 5,
        },
        quotes: {
          maxFavorites: 5,
        },
        users: {
          signUp: false,
          premium: {
            enabled: false,
          },
        },
      } as any;
      const liveConfig: Partial<Configuration> = {
        maintenance: true,
        users: {
          premium: {
            enabled: true,
          },
        } as any,
      };

      //WHEN
      mergeConfigurations(baseConfig, liveConfig);

      //THEN
      expect(baseConfig).toEqual({
        maintenance: true,
        dev: {
          responseSlowdownMs: 5,
        },
        quotes: {
          maxFavorites: 5,
        },
        users: {
          signUp: false,
          premium: {
            enabled: true,
          },
        },
      } as any);
    });
  });
});
