import MonkeyError from "../utils/error";
import { verifySessionToken } from "../utils/auth";
import { isDevEnvironment } from "../utils/misc";
import { NextFunction, Response } from "express";
import {
  incrementAuth,
  recordAuthTime,
  recordRequestCountry,
} from "../utils/prometheus";
import crypto from "crypto";
import { performance } from "perf_hooks";
import { AppRoute, AppRouter } from "@ts-rest/core";
import {
  EndpointMetadata,
  RequestAuthenticationOptions,
} from "@monkeytype/contracts/util/api";
import { Configuration } from "@monkeytype/schemas/configuration";
import { AsyncTsRestRequestHandler, getMetadata } from "./utility";
import { TsRestRequestWithContext } from "../api/types";

export type DecodedToken = {
  type: "Bearer" | "None" | "GithubWebhook";
  uid: string;
  email: string;
};

const DEFAULT_OPTIONS: RequestAuthenticationOptions = {
  isGithubWebhook: false,
  isPublic: false,
  requireFreshToken: false,
  isPublicOnDev: false,
};

/**
 * Authenticate request based on the auth settings of the route.
 * By default a Bearer token with user authentication is required.
 * @returns
 */
export function authenticateTsRestRequest<
  T extends AppRouter | AppRoute,
>(): AsyncTsRestRequestHandler<T> {
  return async (
    req: TsRestRequestWithContext,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const options = {
      ...DEFAULT_OPTIONS,
      ...((getMetadata(req).authenticationOptions ?? {}) as EndpointMetadata),
    };

    const startTime = performance.now();
    let token: DecodedToken;
    let authType = "None";

    const isPublic =
      options.isPublic === true ||
      (options.isPublicOnDev && isDevEnvironment());

    const {
      authorization: authHeader,
      "x-hub-signature-256": githubWebhookHeader,
    } = req.headers;

    try {
      if (options.isGithubWebhook) {
        token = authenticateGithubWebhook(req, githubWebhookHeader);
      } else if (authHeader !== undefined && authHeader !== "") {
        token = await authenticateWithAuthHeader(
          authHeader,
          req.ctx.configuration,
          options,
        );
      } else if (isPublic === true) {
        token = {
          type: "None",
          uid: "",
          email: "",
        };
      } else {
        throw new MonkeyError(
          401,
          "Unauthorized",
          `endpoint: ${req.baseUrl} no authorization header found`,
        );
      }

      incrementAuth(token.type);

      req.ctx = {
        ...req.ctx,
        decodedToken: token,
      };
    } catch (error) {
      authType = authHeader?.split(" ")[0] ?? "None";

      recordAuthTime(
        authType,
        "failure",
        Math.round(performance.now() - startTime),
        req,
      );

      next(error);
      return;
    }
    recordAuthTime(
      token.type,
      "success",
      Math.round(performance.now() - startTime),
      req,
    );

    const country = req.headers["cf-ipcountry"] as string;
    if (country) {
      recordRequestCountry(country, req);
    }

    // if (req.method !== "OPTIONS" && req?.ctx?.decodedToken?.uid) {
    //   recordRequestForUid(req.ctx.decodedToken.uid);
    // }

    next();
  };
}

async function authenticateWithAuthHeader(
  authHeader: string,
  configuration: Configuration,
  options: RequestAuthenticationOptions,
): Promise<DecodedToken> {
  const [authScheme, token] = authHeader.split(" ");

  if (token === undefined) {
    throw new MonkeyError(
      401,
      "Missing authentication token",
      "authenticateWithAuthHeader",
    );
  }

  const normalizedAuthScheme = authScheme?.trim();

  switch (normalizedAuthScheme) {
    case "Bearer":
      return await authenticateWithBearerToken(token, options);
    case "Uid":
      return await authenticateWithUid(token);
  }

  throw new MonkeyError(
    401,
    "Unknown authentication scheme",
    `The authentication scheme "${authScheme}" is not implemented`,
  );
}

async function authenticateWithBearerToken(
  token: string,
  options: RequestAuthenticationOptions,
): Promise<DecodedToken> {
  try {
    const decodedToken = await verifySessionToken(token);

    if (options.requireFreshToken) {
      if (Date.now() - decodedToken.issuedAt > 60 * 1000) {
        throw new MonkeyError(
          401,
          "Unauthorized",
          `This endpoint requires a fresh token`,
        );
      }
    }

    return {
      type: "Bearer",
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    if (error instanceof MonkeyError) throw error;

    const message = error instanceof Error ? error.message : "";
    if (message.includes("expired")) {
      throw new MonkeyError(
        401,
        "Token expired - please login again",
        "authenticateWithBearerToken",
      );
    }

    throw new MonkeyError(
      401,
      "Unauthorized",
      `Failed to verify the token: ${message}`,
    );
  }
}

async function authenticateWithUid(token: string): Promise<DecodedToken> {
  if (!isDevEnvironment()) {
    throw new MonkeyError(401, "Bearer type uid is not supported");
  }
  const [uid, email] = token.split("|");

  if (uid === undefined || uid === "") {
    throw new MonkeyError(401, "Missing uid");
  }

  return {
    type: "Bearer",
    uid: uid,
    email: email ?? "",
  };
}

export function authenticateGithubWebhook(
  req: TsRestRequestWithContext,
  authHeader: string | string[] | undefined,
): DecodedToken {
  try {
    const webhookSecret = process.env["GITHUB_WEBHOOK_SECRET"];

    if (webhookSecret === undefined || webhookSecret === "") {
      throw new MonkeyError(500, "Missing Github Webhook Secret");
    }

    if (
      Array.isArray(authHeader) ||
      authHeader === undefined ||
      authHeader === ""
    ) {
      throw new MonkeyError(401, "Missing Github signature header");
    }

    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    const trusted = Buffer.from(`sha256=${signature}`, "ascii");
    const untrusted = Buffer.from(authHeader, "ascii");
    const isSignatureValid = crypto.timingSafeEqual(trusted, untrusted);

    if (!isSignatureValid) {
      throw new MonkeyError(401, "Github webhook signature invalid");
    }

    return {
      type: "GithubWebhook",
      uid: "",
      email: "",
    };
  } catch (error) {
    if (error instanceof MonkeyError) {
      throw error;
    }
    throw new MonkeyError(
      500,
      `Failed to authenticate Github webhook: ${(error as Error).message}`,
    );
  }
}
