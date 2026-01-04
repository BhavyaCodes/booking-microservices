export const greet = (name: string): string => {
  return `Hello, ${name}!`;
};

export * from "./nats/index";
export * from "./error/CustomErrorResponse";
