# Booking Microservices - AI Coding Instructions

## Architecture Overview

This is a **Bun monorepo** (`workspaces: ["apps/*", "packages/*"]`) for a ticket booking platform with microservices architecture:

- **auth**: Authentication service (Hono + MongoDB/Mongoose) - Google OAuth, JWT sessions stored in cookies
- **tickets**: Ticket/event management (Hono + PostgreSQL/Drizzle) - event-driven with NATS JetStream, implements transactional outbox pattern
- **orders**: Order processing (Hono + PostgreSQL/Drizzle) - in development, will consume ticket events
- **client**: Next.js frontend - server-side rendering with Google OAuth integration
- **packages/common**: Shared library (`@booking/common`) - middlewares, error handling, NATS base classes, interfaces

**Communication Pattern**: Services are async event-driven via **NATS JetStream**. The tickets service publishes events (ticket.created) to NATS streams, and other services consume them. All backend services use **Hono** framework on **Bun** runtime.

**Deployment**: Kubernetes-based with Skaffold for local dev (hot-reload via file sync). Each service has dedicated Postgres/Mongo pods, plus shared NATS JetStream cluster.

## Development Workflow

```bash
# Install all dependencies (run from root)
bun install

# Local development with Kubernetes (primary workflow)
skaffold dev                    # Deploys all services, hot-reloads on save
                                # Requires local k8s (Docker Desktop/minikube)

# Run tests (per-service, from service directory)
cd apps/auth && bun test       # Uses MongoMemoryServer (no external deps)
cd apps/tickets && bun test    # Requires: docker compose -f postgres-test.docker-compose.yml up

# Database migrations (tickets/orders services)
cd apps/tickets
bun run drizzle-kit:generate-dev  # Generate migration from schema changes
bun run drizzle-kit:migrate-dev   # Apply migrations (dev env)
# In k8s, migrations run via Jobs before service starts (see tickets-migration-job.yaml)
```

**Important**: Tests don't auto-start containers. For Postgres-based services, manually run `docker compose -f postgres-test.docker-compose.yml up` before testing.

## Code Patterns

### Hono App Setup

All services use method chaining for type-safe route inference. Always start with middleware stack:

```typescript
// See apps/tickets/src/app.ts
const app = new Hono<{ Variables: { currentUser: CurrentUser } }>()
  .use(logger())                    // Pino logger (configured via pl export)
  .use(extractCurrentUser)          // ALWAYS first - extracts JWT from cookie
  .get("/api/tickets", (c) => ...)  // Chain routes for RPC-style client
  .post("/api/tickets/events", requireAdmin, zValidator(...), handler)
```

**Critical**: `extractCurrentUser` must run on ALL routes (even public ones) to populate `c.get('currentUser')` when authenticated. It never throws - just sets undefined if no valid token.

### Route Protection Layers

```typescript
import { extractCurrentUser, requireAuth, requireAdmin } from "@booking/common/middlewares";

// Public route - currentUser available but optional
.get("/api/tickets", (c) => {
  const user = c.get('currentUser'); // May be undefined
})

// Authenticated route - requires valid JWT
.get("/api/tickets/:id", requireAuth, (c) => {
  const user = c.get('currentUser')!; // Guaranteed to exist
})

// Admin-only route - checks user.role === UserRoles.ADMIN
.post("/api/tickets/events", requireAdmin, (c) => {
  const user = c.get('currentUser')!; // Guaranteed admin
})
```

**Middleware Flow**: `extractCurrentUser` (sets currentUser or undefined) → `requireAuth` (throws 401 if undefined) → `requireAdmin` (throws 403 if not admin).

### Validation Pattern

**Always** use Zod with the shared `zodValidationHook` to ensure consistent error responses:

```typescript
import { zValidator } from "@hono/zod-validator";
import { zodValidationHook } from "@booking/common";
import { z } from "zod";

.post("/route",
  zValidator("json", z.object({
    title: z.string().min(1).max(255),
    date: z.coerce.date().refine((d) => d >= new Date(), {
      message: "Date must not be in the past"
    }),
  }), zodValidationHook),  // Hook formats errors as CustomErrorResponse
  async (c) => {
    const validated = c.req.valid("json"); // Type-safe validated data
  }
)
```

The `zodValidationHook` transforms Zod errors into `CustomErrorResponse` with code `VALIDATION_FAILED`.

### Error Handling Pattern

Use `HTTPException` + `CustomErrorResponse` (both re-exported from `@booking/common`):

```typescript
import {
  CustomErrorResponse,
  ErrorCodes,
  HTTPException,
} from "@booking/common";

// Throw semantic errors with codes
throw new HTTPException(400, {
  res: new CustomErrorResponse({
    message: "Ticket already reserved",
    code: ErrorCodes.VALIDATION_FAILED, // Or UNAUTHORIZED, FORBIDDEN, etc.
  }),
});

// Frontend receives: { "error": { "message": "...", "code": "VALIDATION_FAILED" } }
```

**Never** throw raw `Error` objects - always wrap in `HTTPException`. ErrorCodes enum defined in `@booking/common/error`.

### Database Patterns

**Auth Service** (Mongoose):

```typescript
// See apps/auth/src/models/user.ts
// Use static build() method instead of new User()
const user = User.build({ email, picture });
await user.save();
```

**Tickets/Orders Services** (Drizzle + PostgreSQL):

```typescript
// See apps/tickets/src/db/schema.ts
// UUIDv7 primary keys (time-sortable, better than v4)
export const ticketsTable = pgTable("tickets", {
  id: uuid().primaryKey().default(sql`uuidv7()`),  // Requires pg extension
  ...
});

// Connection strings: see apps/tickets/src/db/index.ts
// Test env uses hardcoded localhost:5432, prod uses {SERVICE}_POSTGRES_* env vars
```

**Critical**: Export `TicketsTxn` type for transaction callbacks:

```typescript
export type TicketsTxn = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

### Event Publishing - Transactional Outbox Pattern

**Why**: Ensures event publishing is atomic with DB changes. See [apps/tickets/src/outbox/index.ts](apps/tickets/src/outbox/index.ts).

**Implementation Steps**:

1. Within DB transaction, insert event row to `outboxTable` (not published yet)
2. PostgreSQL trigger sends NOTIFY on insert (see migration)
3. Service listens for NOTIFY, triggers `outboxPublisher()` background job
4. Job SELECT FOR UPDATE SKIP LOCKED (up to 25 events), publishes to NATS, marks processed

**Usage in routes**:

```typescript
import { addEventToOutBox } from "./outbox";

await db.transaction(async (tx) => {
  const [ticket] = await tx.insert(ticketsTable).values(...).returning();

  // Add event to outbox (published later by background job)
  // Note: data is typically an array for batch publishing
  await addEventToOutBox(tx, {
    subject: Subjects.TicketsCreated,
    data: [{ id: ticket.id, price: ticket.price, seatCategoryId: ticket.seatCategoryId, date: ticket.date.toISOString() }]
  });
});
```

**Event Types**: Defined in [packages/common/nats/events.ts](packages/common/nats/events.ts). When adding new events:

- Export type `YourNewEvent = { subject: Subjects.YourEvent; data: YourDataType[] | YourDataType }`
- Add to `NATSEvent` union type: `export type NATSEvent = TicketCreatedEvent | YourNewEvent`

### NATS Integration

**Connection Setup** (see [apps/tickets/src/index.ts](apps/tickets/src/index.ts)):

```typescript
import { natsWrapper } from "./nats-wrapper";

await natsWrapper.connect("nats://nats-jetstream-srv:4222");
// natsWrapper.nc - NATS connection
// natsWrapper.js - JetStream client
```

**Publishing** (via outbox - see above).

**Consuming** (extend BaseListener):

```typescript
// See packages/common/nats/base-listener.ts
import { BaseListener } from "@booking/common";

export class TicketCreatedListener extends BaseListener<TicketCreatedEvent> {
  subject = Subjects.TicketsCreated;
  stream = "tickets-stream"; // Must match k8s stream config

  async onMessage(msg: JsMsg) {
    const data = JSON.parse(msg.data as string);
    // Process event...
    msg.ack(); // Manual ack required
  }
}

// Start listener in index.ts
new TicketCreatedListener(natsWrapper.js).listen();
```

**Orders Service Note**: Event listener code is commented out (see [apps/orders/src/index.ts](apps/orders/src/index.ts)) - uncomment when ready to consume events.

### Logging Pattern

All services use Pino logger with identical config:

```typescript
// See apps/tickets/src/logger.ts
import { pl } from "./logger"; // "pl" = pino logger

pl.trace("Debug details");
pl.info("Normal operation");
pl.error({ err, context }, "Error message");
pl.fatal(err, "Unrecoverable error"); // Logs then exits
```

**Convention**: Always use `pl` export name for consistency. Use structured logging (pass objects before message).

### Service Bootstrap Pattern

Every service's `index.ts` follows this structure (see [apps/tickets/src/index.ts](apps/tickets/src/index.ts)):

1. Validate required env vars (throw early if missing)
2. Connect to NATS JetStream
3. Start event listeners (if consuming events)
4. Connect to database (Postgres/Mongo)
5. Set up PostgreSQL LISTEN for outbox notifications (Postgres services only)
6. Start Bun server on port 3000
7. Register cleanup handlers (SIGINT/SIGTERM) - drain NATS, release DB connections

**Auth Service**: MongoDB, no NATS listeners, simple startup.
**Tickets Service**: PostgreSQL with outbox pattern, LISTEN/NOTIFY setup required.
**Orders Service**: PostgreSQL setup done, but event listeners are commented out (uncomment when implementing order consumption).

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

  const res = await client.api.tickets.events.$post(
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

  const res = await client.api.tickets.events.$post(
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
- **API routes**: `/api/{service}/...` (e.g., `/api/auth/google-callback`, `/api/tickets/events`)
- **K8s services**: `{service}-srv` or `{service}-{db}-srv` (e.g., `tickets-srv`, `tickets-postgres-srv`)
- **K8s deployments**: `{service}-depl` (e.g., `auth-depl`)
- **NATS subjects**: `{service}.{action}` (e.g., `tickets.created`)
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
