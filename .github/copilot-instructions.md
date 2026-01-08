# Booking Microservices - AI Coding Instructions

## Architecture Overview

This is a **Bun monorepo** (`workspaces: ["apps/*", "packages/*"]`) for a ticket booking platform with:

- **auth**: Authentication service (Hono + MongoDB/Mongoose) - Google OAuth, JWT sessions
- **tickets**: Ticket management (Hono + PostgreSQL/Drizzle) - event-driven with NATS JetStream
- **orders**: Order processing (Hono + PostgreSQL/Drizzle) - in development
- **client**: Next.js frontend
- **packages/common**: Shared library (`@booking/common`) - middlewares, error handling, NATS types

Services communicate via **NATS JetStream** for async events. All backend services use **Hono** framework running on **Bun**.

## Development Workflow

```bash
# Install all dependencies (run from root)
bun install

# Local development with Kubernetes
skaffold dev                    # Deploys all services to local k8s

# Run tests (per-service, from service directory)
cd apps/auth && bun test       # Uses MongoMemoryServer
cd apps/tickets && bun test    # Requires postgres-test.docker-compose.yml running

# Database migrations (tickets service)
bun run drizzle-kit:generate-dev  # Generate migration
bun run drizzle-kit:migrate-dev   # Run migration
```

## Code Patterns

### Hono App Setup

All services follow this pattern - see [apps/tickets/src/app.ts](apps/tickets/src/app.ts):

```typescript
const app = new Hono<{ Variables: { currentUser: CurrentUser } }>()
  .use(logger())
  .use(extractCurrentUser)         // Always extract user from JWT
  .get("/api/service", ...)        // Chain routes for type inference
```

### Route Protection

Use middlewares from `@booking/common/middlewares`:

- `extractCurrentUser` - Always applied, extracts JWT from `session` cookie
- `requireAuth` - Returns 401 if no user
- `requireAdmin` - Returns 403 if user.role !== "admin"

### Validation Pattern

Always use Zod with the shared validation hook:

```typescript
import { zValidator } from "@hono/zod-validator";
import { zodValidationHook } from "@booking/common";

.post("/route", zValidator("json", schema, zodValidationHook), handler)
```

### Error Responses

Use `CustomErrorResponse` with `HTTPException` (re-exported from `@booking/common`):

```typescript
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
} from "@booking/common";

throw new HTTPException(400, {
  res: new CustomErrorResponse({
    message: "...",
    code: ErrorCodes.VALIDATION_FAILED,
  }),
});
```

### Database Patterns

- **auth**: Mongoose with static `build()` method - see [apps/auth/src/models/user.ts](apps/auth/src/models/user.ts)
- **tickets/orders**: Drizzle ORM with PostgreSQL, UUIDv7 for primary keys - see [apps/tickets/src/db/schema.ts](apps/tickets/src/db/schema.ts)

### Event Publishing (Outbox Pattern)

Tickets service uses transactional outbox - see [apps/tickets/src/outbox/index.ts](apps/tickets/src/outbox/index.ts):

1. Insert event to `outboxTable` within transaction
2. Background job publishes to NATS and marks processed

Event types defined in [packages/common/nats/events.ts](packages/common/nats/events.ts).

## Testing Conventions

Tests use Vitest with global setup files providing `global.signin()` helper:

- **auth**: Uses `MongoMemoryServer`, signin creates real user - see [apps/auth/src/vitest-setup.ts](apps/auth/src/vitest-setup.ts)
- **tickets**: Uses test postgres container, signin just creates JWT - see [apps/tickets/src/vitest-setup.ts](apps/tickets/src/vitest-setup.ts)

Use Hono's `testClient` for type-safe API testing:

```typescript
import { testClient } from "hono/testing";
const client = testClient(app);
await client.api.tickets.$get(
  {},
  { headers: { Cookie: await global.signin() } },
);
```

## Key Files Reference

| Purpose            | Location                         |
| ------------------ | -------------------------------- |
| Shared middlewares | `packages/common/middlewares/`   |
| Error handling     | `packages/common/error/`         |
| NATS event types   | `packages/common/nats/events.ts` |
| K8s manifests      | `infra/k8s/`                     |
| Dockerfiles        | `infra/docker/`                  |
| Env vars template  | `dev.env`                        |

## Naming Conventions

- Package names: `@booking/{service}` (e.g., `@booking/auth`, `@booking/common`)
- API routes: `/api/{service}/...` (e.g., `/api/auth/google-callback`, `/api/tickets/events`)
- K8s services: `{service}-srv` (e.g., `auth-srv`, `tickets-srv`)
- NATS subjects: `{service}.{action}` (e.g., `tickets.created`)
