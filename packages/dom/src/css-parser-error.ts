// Keeps the private CSS parser's recoverable errors compatible with V8 stack formatting.

/** Creates the parser's SyntaxError-shaped record and captures its call site for lazy inspection. */
export function createCustomError(name: string, message: string): SyntaxError {
  const error: SyntaxError = Object.create(SyntaxError.prototype);
  error.name = name;
  error.message = message;
  Error.captureStackTrace(error, createCustomError);
  Object.defineProperty(error, "stack", { enumerable: true });
  return error;
}
