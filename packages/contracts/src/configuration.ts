import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { ConfigurationSchema } from "@monkeytype/schemas/configuration";
import { CommonResponses, meta, responseWithData } from "./util/api";

export const GetConfigurationResponseSchema =
  responseWithData(ConfigurationSchema);

export type GetConfigurationResponse = z.infer<
  typeof GetConfigurationResponseSchema
>;

const c = initContract();

export const configurationContract = c.router(
  {
    get: {
      summary: "get configuration",
      description: "Get server configuration",
      method: "GET",
      path: "",
      responses: {
        200: GetConfigurationResponseSchema,
      },
      metadata: meta({
        authenticationOptions: {
          isPublic: true,
        },
      }),
    },
  },
  {
    pathPrefix: "/configuration",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "configuration",
    }),

    commonResponses: CommonResponses,
  },
);
