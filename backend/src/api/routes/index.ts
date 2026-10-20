import { contract } from "@monkeytype/contracts/index";
import users from "./users";
import results from "./results";
import presets from "./presets";
import dev from "./dev";
import configs from "./configs";
import configuration from "./configuration";
import { version } from "../../version";
import { MonkeyResponse } from "../../utils/monkey-response";
import { Application, IRouter, NextFunction, Response } from "express";
import { isDevEnvironment } from "../../utils/misc";
import { getLiveConfiguration } from "../../init/configuration";
import Logger from "../../utils/logger";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { ZodIssue } from "zod";
import { authenticateTsRestRequest } from "../../middlewares/auth";
import { rateLimitRequest } from "../../middlewares/rate-limit";
import { verifyRequiredConfiguration } from "../../middlewares/configuration";
import { ExpressRequestWithContext } from "../types";

const APP_START_TIME = Date.now();

const s = initServer();
const router = s.router(contract, {
  configs,
  presets,
  results,
  configuration,
  dev,
  users,
});

export function addApiRoutes(app: Application): void {
  applyDevApiRoutes(app);
  applyApiRoutes(app);
  applyTsRestApiRoutes(app);

  app.use((req, res) => {
    res
      .status(404)
      .json(
        new MonkeyResponse(
          `Unknown request URL (${req.method}: ${req.path})`,
          null,
        ),
      );
  });
}

function applyTsRestApiRoutes(app: IRouter): void {
  createExpressEndpoints(contract, router, app, {
    jsonQuery: true,
    requestValidationErrorHandler(err, req, res, _next) {
      let message: string | undefined = undefined;
      let validationErrors: string[] | undefined = undefined;

      if (err.pathParams?.issues !== undefined) {
        message = "Invalid path parameter schema";
        validationErrors = err.pathParams.issues.map(prettyErrorMessage);
      } else if (err.query?.issues !== undefined) {
        message = "Invalid query schema";
        validationErrors = err.query.issues.map(prettyErrorMessage);
      } else if (err.body?.issues !== undefined) {
        message = "Invalid request data schema";
        validationErrors = err.body.issues.map(prettyErrorMessage);
      } else if (err.headers?.issues !== undefined) {
        message = "Invalid header schema";
        validationErrors = err.headers.issues.map(prettyErrorMessage);
      } else {
        Logger.error(
          `Unknown validation error for ${req.method} ${
            req.path
          }: ${JSON.stringify(err)}`,
        );
        res
          .status(500)
          .json({ message: "Unknown validation error. Contact support." });
        return;
      }

      res.status(422).json({ message, validationErrors });
    },
    globalMiddleware: [
      authenticateTsRestRequest(),
      rateLimitRequest(),
      verifyRequiredConfiguration(),
    ],
  });
}

function prettyErrorMessage(issue: ZodIssue | undefined): string {
  if (issue === undefined) return "";
  const path = issue.path.length > 0 ? `"${issue.path.join(".")}" ` : "";
  return `${path}${issue.message}`;
}

function applyDevApiRoutes(app: Application): void {
  if (isDevEnvironment()) {
    //disable csp to allow assets to load from unsecured http
    app.use((req, res, next) => {
      res.setHeader("Content-Security-Policy", "");
      next();
    });
    app.use(async (req, res, next) => {
      const slowdown = (await getLiveConfiguration()).dev.responseSlowdownMs;
      if (slowdown > 0) {
        Logger.info(
          `Simulating ${slowdown}ms delay for ${req.method} ${req.path}`,
        );
        await new Promise((resolve) => setTimeout(resolve, slowdown));
      }
      next();
    });
  }
}

function applyApiRoutes(app: Application): void {
  app.use(
    (
      req: ExpressRequestWithContext,
      res: Response,
      next: NextFunction,
    ): void => {
      if (req.path.startsWith("/configuration")) {
        next();
        return;
      }

      const inMaintenance =
        process.env["MAINTENANCE"] === "true" ||
        req.ctx.configuration.maintenance;

      if (inMaintenance) {
        res.status(503).json({ message: "Server is down for maintenance" });
        return;
      }

      next();
    },
  );

  app.get("/", (_req, res) => {
    res.status(200).json(
      new MonkeyResponse("ok", {
        uptime: Date.now() - APP_START_TIME,
        version,
      }),
    );
  });
}
