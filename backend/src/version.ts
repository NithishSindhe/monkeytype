import { join } from "path";
import { isDevEnvironment, padNumbers } from "./utils/misc";
import { readFileSync, writeFileSync, existsSync } from "fs";

const SERVER_VERSION_FILE_PATH = join(__dirname, "./server.version");
const { COMMIT_HASH = "NO_HASH" } = process.env;

function getDateVersion(): string {
  const date = new Date();

  const versionPrefix = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ];
  const versionSuffix = [date.getHours(), date.getMinutes()];

  return [versionPrefix, versionSuffix]
    .map((versionPart) => padNumbers(versionPart, 2, "0").join("."))
    .join("_");
}

function getVersion(): string {
  if (isDevEnvironment()) {
    return "DEVELOPMENT-VERSION";
  }

  if (existsSync(SERVER_VERSION_FILE_PATH)) {
    return readFileSync(SERVER_VERSION_FILE_PATH, "utf-8");
  }

  const serverVersion = `${getDateVersion()}_${COMMIT_HASH}`;
  try {
    writeFileSync(SERVER_VERSION_FILE_PATH, serverVersion);
  } catch {
    // read only filesystem (vercel), the version is just not persisted
  }

  return serverVersion;
}

export const version = getVersion();
