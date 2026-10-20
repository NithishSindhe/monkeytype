import "dotenv/config";
import {
  getLiveConfiguration,
  updateFromConfigurationFile,
} from "./init/configuration";
import app from "./app";
import { Server } from "http";
import { version } from "./version";
import { recordServerVersion } from "./utils/prometheus";
import Logger from "./utils/logger";
import { init as initFirebaseAdmin } from "./init/firebase-admin";
import { getErrorMessage } from "./utils/error";

async function bootServer(port: number): Promise<Server> {
  try {
    Logger.info(`Starting server version ${version}`);
    Logger.info(`Starting server in ${process.env["MODE"]} mode`);
    Logger.info("Initializing Firebase app instance...");
    initFirebaseAdmin();

    Logger.info("Fetching live configuration...");
    await getLiveConfiguration();
    Logger.success("Live configuration fetched");
    await updateFromConfigurationFile();

    recordServerVersion(version);
  } catch (error) {
    Logger.error("Failed to boot server");
    const message = getErrorMessage(error);
    Logger.error(message ?? "Unknown error");
    console.error(error);
    return process.exit(1);
  }

  return app.listen(port, () => {
    Logger.success(`API server listening on port ${port}`);
  });
}

const PORT = parseInt(process.env["PORT"] ?? "5005", 10);

void bootServer(PORT);
