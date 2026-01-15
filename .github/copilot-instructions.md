# Booking Microservices - AI Coding Instructions

## Architecture Overview

**Bun monorepo** for a ticket booking platform with event-driven microservices:

- **Auth**: Google OAuth + JWT in cookies, MongoDB. Path: `apps/auth/`
- **Tickets**: Event management, PostgreSQL + Drizzle ORM, publishes events via NATS. Path: `apps/tickets/`
- **Orders**: Order processing from ticket events. Path: `apps/orders/`
- **Client**: Next.js frontend. Path: `apps/client/`
- **Common**: Shared middlewares, types, error handling. Path: `packages/common/`

### Critical Data Flows

1. **Event Publishing (Tickets → Orders)**:
   - Tickets Service uses **transactional outbox pattern** (`src/outbox/index.ts`)
   - Changes to DB + outbox inserts happen in atomic transaction
   - PostgreSQL NOTIFY triggers background `outboxPublisher()` to publish to NATS
   - Orders Service listens to `Subjects.TicketsReserved` (see `packages/common/nats/events.ts`)

2. **Authentication**: JWT token in `session` cookie, verified by `extractCurrentUser` middleware on all routes

3. **Database per Service**: Auth (MongoDB), Tickets (PostgreSQL), Orders (PostgreSQL). No shared DBs.

## Essential Developer Workflows

### Local Development (primary)

```bash
# Terminal 1: Deploy all services with hot-reload (requires Docker Desktop or Minikube)
skaffold dev

# Terminal 2 (optional): Debug logs
kubectl logs -f deployment/{service}-depl
```

### Testing

**Important**: Database containers do NOT auto-start. Start manually before running tests.

```bash
# Auth Service (uses MongoMemoryServer - no external deps)
cd apps/auth && bun test

# Tickets Service (requires Postgres)
cd apps/tickets
docker compose -f postgres-test.docker-compose.yml up  # Terminal 1
bun test  # Terminal 2

# Orders Service (similar setup)
cd apps/orders
docker compose -f postgres-test.docker-compose.yml up
bun test
```

### Database Migrations

```bash
cd apps/tickets

# Generate migration from schema.ts changes
bun run drizzle-kit:generate-dev

# Apply to dev environment
bun run drizzle-kit:migrate-dev

# In Kubernetes: migrations auto-run via Jobs before service startup (see infra/k8s/*-migration-job.yaml)
```

### Install Dependencies

```bash
bun install  # From root directory
```

## Project-Specific Conventions

- **Middleware Usage**: Always use `extractCurrentUser` middleware on all routes to populate `currentUser` in the context. This is critical for authentication checks.
- **Validation**: Use Zod for request validation with the `zValidator` middleware to ensure consistent error handling.
- **Error Handling**: Use `HTTPException` and `CustomErrorResponse` for structured error responses.

## Code Patterns

### Hono App Setup

All services use method chaining for type-safe RPC-style routes. **CRITICAL**: `extractCurrentUser` must run on ALL routes (even public ones) to populate `c.get('currentUser')` when authenticated. It never throws—sets undefined if no valid token.

```typescript
// See apps/tickets/src/app.ts
const app = new Hono<{ Variables: { currentUser: CurrentUser } }>()
  .use(logger())                    // Pino logger
  .use(extractCurrentUser)          // ALWAYS first—extracts JWT from cookie
  .get("/api/tickets", (c) => ...)  // Public: currentUser may be undefined
  .post("/api/tickets/admin/events", requireAdmin, zValidator(...), handler) // Admin-only
```

### Route Protection Pattern

```typescript
import { extractCurrentUser, requireAuth, requireAdmin } from "@booking/common/middlewares";

// Middleware flow: extractCurrentUser (sets or undefined) → requireAuth (throws 401) → requireAdmin (throws 403)

.get("/api/tickets", (c) => {
  const user = c.get('currentUser'); // May be undefined
})

.get("/api/tickets/:id", requireAuth, (c) => {
  const user = c.get('currentUser')!; // Guaranteed to exist (401 if not)
})

.post("/api/tickets/admin/events", requireAdmin, (c) => {
  const user = c.get('currentUser')!; // Guaranteed admin (403 if not)
})
```

### Validation & Error Handling

**Always** use Zod + `zodValidationHook` for consistent error responses:

```typescript
import { zValidator } from "@hono/zod-validator";
import { zodValidationHook } from "@booking/common";
import { z } from "zod";
import { CustomErrorResponse, ErrorCodes, HTTPException } from "@booking/common";

.post("/route",
  zValidator("json", z.object({
    title: z.string().min(1).max(255),
    date: z.coerce.date().refine((d) => d >= new Date(), {
      message: "Date must not be in the past"
    }),
  }), zodValidationHook),  // Formats errors as CustomErrorResponse
  async (c) => {
    const validated = c.req.valid("json");

    // Throw semantic errors
    if (someCondition) {
      throw new HTTPException(400, {
        res: new CustomErrorResponse({
          message: "Ticket already reserved",
          code: ErrorCodes.VALIDATION_FAILED, // Use enum, never raw strings
        }),
      });
    }
  }
)
```

**Never throw raw `Error` objects.** Always use `HTTPException` + `CustomErrorResponse`.

### Event Publishing – Transactional Outbox Pattern

**Why**: Ensures atomic DB changes + event publishing. Single point of failure = no events, not split state.

**Implementation** (see [apps/tickets/src/outbox/index.ts](apps/tickets/src/outbox/index.ts)):

1. Within DB transaction, insert event row to `outboxTable` (not yet published)
2. PostgreSQL trigger sends NOTIFY on insert
3. Service LISTEN handler triggers `outboxPublisher()` background job
4. Job: SELECT FOR UPDATE SKIP LOCKED (batch up to 25 events) → publish to NATS → mark processed

**Usage in routes**:

```typescript
import { addEventToOutBox } from "./outbox";

await db.transaction(async (tx) => {
  const [ticket] = await tx.insert(ticketsTable).values(...).returning();

  // Add to outbox (published later by background worker)
  await addEventToOutBox(tx, {
    subject: Subjects.TicketsReserved,
    data: { ticketIds: [ticket.id], userId: user.id, amount: 100, expiresAt: new Date().toISOString() }
  });
});
```

**Event Types**: Define in [packages/common/nats/events.ts](packages/common/nats/events.ts):

```typescript
export type YourEvent = {
  subject: Subjects.YourSubject;
  data: {
    /* structured data */
  }; // Can be object or array
};

export type NATSEvent = YourEvent | OtherEvent; // Add to union
```

### Database Patterns

**Auth Service** (Mongoose):

```typescript
// See apps/auth/src/models/user.ts
const user = User.build({ email, picture });
await user.save();
```

**Tickets/Orders Services** (Drizzle + PostgreSQL):

```typescript
// UUIDv7 primary keys (time-sortable, better than v4)
export const ticketsTable = pgTable("tickets", {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`), // Requires pg extension
  createdAt: timestamp().defaultNow(),
  // ...
});

// Export transaction type for type-safe callbacks
export type TicketsTxn = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Connection strings:
// Dev: uses hardcoded localhost:5432 (see src/db/index.ts)
// Prod: uses {SERVICE}_POSTGRES_* env vars
```

### NATS Integration

**Connection** (in `index.ts`):

```typescript
await natsWrapper.connect("nats://nats-jetstream-srv:4222");
// natsWrapper.nc = NATS client
// natsWrapper.js = JetStream client
```

**Publishing**: Via outbox pattern (see above—never direct publish).

**Consuming** (extend BaseListener):

```typescript
import { BaseListener } from "@booking/common";
import type { TicketsReservedEvent } from "@booking/common/nats/events";
import { Subjects } from "@booking/common";

export class TicketsReservedListener extends BaseListener<TicketsReservedEvent> {
  subject = Subjects.TicketsReserved;
  stream = "tickets-stream"; // Must match k8s JetStream stream config

  async onMessage(msg: JsMsg) {
    const data = JSON.parse(msg.data as string);
    // Process event...
    msg.ack(); // Manual ack required (important!)
  }
}

// Start in index.ts
new TicketsReservedListener(natsWrapper.js).listen();
```

### Logging Pattern

All services use Pino with identical config:

```typescript
import { pl } from "./logger"; // "pl" = pino logger

pl.trace("Debug details");
pl.info("Normal operation");
pl.error({ err, context }, "Error message");
pl.fatal(err, "Unrecoverable error"); // Logs then exits with code 1
```

Convention: Always export as `pl` for consistency. Use structured logging (pass objects before message).

### Service Bootstrap Pattern

Every service's `index.ts` follows this order:

1. Validate required env vars (throw early)
2. Connect to NATS JetStream (skip for Auth)
3. Start event listeners if consuming (skip for Auth, commented for Orders)
4. Connect to database
5. **For Postgres services**: Set up PostgreSQL LISTEN/NOTIFY for outbox
6. Start Bun server on port 3000
7. Register SIGINT/SIGTERM cleanup handlers (drain NATS, release DB pools)

See [apps/tickets/src/index.ts](apps/tickets/src/index.ts) for full example.

## Testing Conventions

**Framework**: Vitest with global setup files defining `global.signin()` helper.

**Auth Service Tests** ([apps/auth/src/vitest-setup.ts](apps/auth/src/vitest-setup.ts)):

- Uses `MongoMemoryServer` (no external deps)
- `global.signin(email?)` creates real user in DB, returns signed JWT cookie
- `beforeEach` drops entire database

**Tickets/Orders Service Tests** ([apps/tickets/src/vitest-setup.ts](apps/tickets/src/vitest-setup.ts)):

- Requires running Postgres: `docker compose -f postgres-test.docker-compose.yml up`
- `global.signin({ id?, role? })` just creates JWT (no DB insert) - faster for auth checks
- `beforeEach` deletes all rows from tables (not DROP - preserves schema)

**Test Pattern**:

```typescript
import { testClient } from "hono/testing";
import { app } from "../app";
import { UserRoles } from "@booking/common/interfaces";

const client = testClient(app);

it("should create event as admin", async () => {
  const cookie = await global.signin({ role: UserRoles.ADMIN });

  const res = await client.api.tickets.admin.events.$post(
    {
      json: {
        title: "Test Event",
        desc: "Description",
        date: new Date(Date.now() + 86400000),
      },
    },
    { headers: { Cookie: cookie } },
  );

  expect(res.status).toBe(201);
});

it("should return 403 for non-admin users", async () => {
  const cookie = await global.signin({ role: UserRoles.USER });

  const res = await client.api.tickets.admin.events.$post(
    {
      json: {
        title: "Test",
        desc: "Test",
        date: new Date(Date.now() + 86400000),
      },
    },
    { headers: { Cookie: cookie } },
  );

  expect(res.status).toBe(403);
});
```

Use `testClient` for type-safe RPC-style calls with autocomplete for routes and query params. Always pass `Cookie` header for authenticated routes via second argument options.

## Key Files Reference

| Purpose                     | Location                                    |
| --------------------------- | ------------------------------------------- |
| Shared middlewares          | `packages/common/middlewares/`              |
| Error handling              | `packages/common/error/`                    |
| NATS event types            | `packages/common/nats/events.ts`            |
| NATS base classes           | `packages/common/nats/base-listener.ts`     |
| User roles enum             | `packages/common/interfaces/user-roles.ts`  |
| K8s manifests               | `infra/k8s/*.yaml`                          |
| Dockerfiles (multi-stage)   | `infra/docker/dev-*.Dockerfile`             |
| Env vars (local dev)        | `dev.env` (load via ConfigMap in k8s)       |
| Outbox implementation       | `apps/tickets/src/outbox/index.ts`          |
| Postgres notification setup | `apps/tickets/src/index.ts` (LISTEN/NOTIFY) |

## Naming Conventions

- **Package names**: `@booking/{service}` (workspace protocol: `@booking/common@workspace:*`)
- **API routes**: `/api/{service}/...` (e.g., `/api/auth/google-callback`, `/api/tickets/admin/events`)
- **K8s services**: `{service}-srv` or `{service}-{db}-srv` (e.g., `tickets-srv`, `tickets-postgres-srv`)
- **K8s deployments**: `{service}-depl` (e.g., `auth-depl`)
- **NATS subjects**: `{service}.{action}` (e.g., `tickets.reserved`)
- **NATS streams**: `{service}-stream` (configured via k8s Job applying nats-jetstream-stream-config.yaml)
- **Environment variables**: `{SERVICE}_{COMPONENT}_{VAR}` (e.g., `TICKETS_POSTGRES_PASSWORD`)

## Environment Variables

**Required for all services**:

- `JWT_KEY`: Shared secret for signing/verifying session tokens
- `NODE_ENV`: Set to `test` in vitest-setup (changes DB connection strings)

**Per-service** (see `dev.env` for examples):

- Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `AUTH_CREATE_ADMIN_HASH`
- Tickets: `TICKETS_POSTGRES_USER`, `TICKETS_POSTGRES_PASSWORD`, `TICKETS_POSTGRES_DB`
- Orders: `ORDERS_POSTGRES_USER`, `ORDERS_POSTGRES_PASSWORD`, `ORDERS_POSTGRES_DB`
- Client: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_BASE_URL`

**Loading**: In k8s, loaded via ConfigMap/Secret (see deployment yamls). Locally via shell or .env loader.

## Common Pitfalls

1. **Forgetting `extractCurrentUser` middleware**: Always apply it before any route - even public routes need it for optional auth
2. **Missing zodValidationHook**: Validation errors won't match API error format without it
3. **Not running postgres-test container**: Drizzle services fail tests silently without it
4. **Publishing events outside transaction**: Use outbox pattern - direct NATS publish risks data inconsistency
5. **Hardcoded service URLs**: Use k8s service discovery (`http://{service}-srv`) in production, `localhost:3000` for local testing
6. **Missing msg.ack() in listeners**: NATS won't advance consumer cursor without explicit ack
