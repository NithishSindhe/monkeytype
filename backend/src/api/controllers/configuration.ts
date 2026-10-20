import * as Configuration from "../../init/configuration";
import { MonkeyResponse } from "../../utils/monkey-response";
import { GetConfigurationResponse } from "@monkeytype/contracts/configuration";
import { MonkeyRequest } from "../types";

export async function getConfiguration(
  _req: MonkeyRequest,
): Promise<GetConfigurationResponse> {
  const currentConfiguration = await Configuration.getCachedConfiguration(true);
  return new MonkeyResponse("Configuration retrieved", currentConfiguration);
}
