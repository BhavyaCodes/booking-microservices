// Bun preload used only by the Cloud Agent / local dev environment.
//
// Each backend service hardcodes `Bun.serve({ port: 3000 })` because in
// Kubernetes every pod has its own network namespace. On a single host we run
// all services together, so they would collide on port 3000. This preload wraps
// Bun.serve so that, when a PORT env var is set, it overrides the listen port
// without modifying any application source. When PORT is unset the original
// hardcoded port is used, so production/Kubernetes behaviour is unchanged.
const originalServe = Bun.serve.bind(Bun);

// @ts-expect-error - intentionally overriding the global Bun.serve for dev.
Bun.serve = (options: unknown) => {
  if (process.env.PORT && options && typeof options === "object") {
    return originalServe({
      ...(options as Record<string, unknown>),
      port: Number(process.env.PORT),
    } as Parameters<typeof originalServe>[0]);
  }
  return originalServe(options as Parameters<typeof originalServe>[0]);
};
