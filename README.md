# Payment Ledger API

Express + Prisma API for authentication, products, orders, payment webhooks, idempotency, and ledger summaries.

**Requirements**
- Bun
- Docker, recommended for local PostgreSQL and Redis
- PostgreSQL
- Redis, used by idempotency and BullMQ

**Setup**
Install dependencies:

```bash
bun install
```

Create a local env file from the committed example:

```bash
cp .env.example .env
```

Fill in `.env` values:

```env
PORT=
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
PAYMENT_WEBHOOK_SECRET=
APP_BASE_URL=
```

Example local values:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5432/payment_ledger?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="7d"
PAYMENT_WEBHOOK_SECRET="replace-with-webhook-secret"
APP_BASE_URL="http://localhost:3000"
```

**Docker Services**
Start PostgreSQL locally with Docker:

```bash
docker run --name payment-ledger-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=payment_ledger \
  -p 5432:5432 \
  -d postgres:16
```

Start Redis locally with Docker:

```bash
docker run --name payment-ledger-redis \
  -p 6379:6379 \
  -d redis:7
```

With those containers, use:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/payment_ledger?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
```

If containers already exist, start them again with:

```bash
docker start payment-ledger-postgres payment-ledger-redis
```

Apply the Prisma schema and generate the client:

```bash
bunx prisma db push
bunx prisma generate
```

Seed sample products:

```bash
bun run seed
```

If your local database still has an older UUID-based schema and this is disposable dev data, reset it first:

```bash
bunx prisma db push --force-reset
bun run seed
```

**Run Locally**
Start the API:

```bash
bun run dev
```

Start the post-payment BullMQ worker in another terminal:

```bash
bun run worker:post-payment
```

Run checks:

```bash
bun run typecheck
bun run test
```

**Important Headers**
Authenticated endpoints require:

```http
Authorization: Bearer <jwt>
```

`POST /orders` also requires:

```http
Idempotency-Key: <unique-request-key>
```

Payment webhooks require an HMAC-SHA256 signature of the exact raw JSON request body using `PAYMENT_WEBHOOK_SECRET`:

```http
x-signature-sha256: <hex-hmac>
```

**Main Scripts**
- `bun run dev`: start API in watch mode
- `bun run seed`: seed sample products
- `bun run worker:post-payment`: start BullMQ post-payment worker
- `bun run typecheck`: run TypeScript checks
- `bun run test`: run Jest tests
