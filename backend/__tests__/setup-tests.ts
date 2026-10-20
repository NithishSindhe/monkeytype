import { afterAll, beforeAll, vi } from "vitest";
import { BASE_CONFIGURATION } from "../src/constants/base-configuration";
import { setupCommonMocks } from "./setup-common-mocks";
import { setDb } from "../src/init/sql";

process.env["MODE"] = "dev";
process.env.TZ = "UTC";

vi.mock("../src/init/configuration", async (importOriginal) => {
  const orig = (await importOriginal()) as any;

  return {
    __testing: orig.__testing,
    getLiveConfiguration: () => BASE_CONFIGURATION,
    getCachedConfiguration: () => BASE_CONFIGURATION,
    patchConfiguration: vi.fn(),
  };
});

setupCommonMocks();

beforeAll(async () => {
  // unit tests mock the DALs, nothing may reach a real database. Anything that
  // slips through hits this instead of trying to open a connection.
  const refuse = (): never => {
    throw new Error("unit tests must not query the database");
  };

  setDb(
    new Proxy(refuse as never, {
      apply: refuse,
      get: () => refuse,
    }),
  );
});

afterAll(async () => {
  setDb(undefined);
  vi.resetAllMocks();
});
