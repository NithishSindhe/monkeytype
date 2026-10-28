import { randomUUID } from "crypto";
import { isDevEnvironment } from "./misc";
import { MonkeyServerErrorType } from "@monkeytype/contracts/util/api";

export function getErrorMessage(error: unknown): string | undefined {
  let message = "";

  if (error instanceof Error) {
    message = error.message;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    (typeof error.message === "string" || typeof error.message === "number")
  ) {
    message = `${error.message}`;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "number") {
    message = `${error}`;
  }

  if (message === "") {
    return undefined;
  }

  return message;
}

class MonkeyError extends Error implements MonkeyServerErrorType {
  status: number;
  errorId: string;
  uid?: string;

  constructor(status: number, message?: string, stack?: string, uid?: string) {
    super(message);
    this.status = status ?? 500;
    this.errorId = randomUUID();
    this.stack = stack;
    this.uid = uid;

    if (isDevEnvironment()) {
      this.message =
        (stack ?? "")
          ? `${String(message)}\nStack: ${String(stack)}`
          : String(message);
    } else {
      if ((this.stack ?? "") && this.status >= 500) {
        this.stack = `${this.message}\n${this.stack}`;
        this.message = `Internal Server Error ${this.errorId}`;
      } else {
        this.message = String(message);
      }
    }
  }
}

export default MonkeyError;
