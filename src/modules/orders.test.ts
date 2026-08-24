import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import jwt from "jsonwebtoken"
import request from "supertest"

const redisStore = new Map<string, string>()

jest.mock("../utils/redis", () => ({
  redis: {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value)
      return Promise.resolve("OK")
    }),
  },
}))

const orderCreateMock = jest.fn<() => Promise<unknown>>()

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
  })),
}))

jest.mock("../utils", () => ({
  prisma: {
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      product: {
        findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ id: 1, stock: 10 }]),
      },
      order: {
        create: orderCreateMock,
      },
    })),
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

describe("POST /orders idempotency", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test"
    process.env.JWT_SECRET = "test-secret"
    redisStore.clear()
    orderCreateMock.mockResolvedValue({
      id: 1,
      status: "PENDING",
      totalAmount: 1000,
      items: [{ productId: 1, quantity: 2, priceAtOrder: 500 }],
    })
  })

  it("returns the cached response for the same idempotency key without creating a new order", async () => {
    const { app } = await import("../index")
    const token = jwt.sign({ userId: "user-1" }, process.env.JWT_SECRET!)
    const idempotencyKey = "same-order-key"
    const body = {
      items: [{ productId: 1, quantity: 2, priceAtOrder: 500 }],
    }

    const firstResponse = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201)

    const secondResponse = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201)

    expect(secondResponse.body).toEqual(firstResponse.body)
    expect(orderCreateMock).toHaveBeenCalledTimes(1)
  })
})
