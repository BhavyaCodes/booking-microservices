export const greet = (name: string): string => {
  return `Hello, ${name}!`;
};

export * from "./nats/index";
export * from "./error/CustomErrorResponse";
export * from "./error/zod-middleware-hook";

// Re-export HTTPException so all apps use the same instance
export { HTTPException } from "hono/http-exception";
