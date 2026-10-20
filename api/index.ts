import "dotenv/config";
import type { Request, Response } from "express";
import express from "express";

import app from "../backend/src/app";
import { getLiveConfiguration } from "../backend/src/init/configuration";

// Vercel strips nothing from the path, so the express routes (which have no
// /api prefix) are mounted under /api here.
const handler = express();
handler.use("/api", app);

let configurationLoaded: Promise<unknown> | undefined;

/**
 * Serverless entry point. There is no boot phase, so the configuration is
 * fetched on the first request and reused while the instance stays warm.
 */
export default async function (req: Request, res: Response): Promise<void> {
  configurationLoaded ??= getLiveConfiguration();
  await configurationLoaded;

  handler(req, res);
}
