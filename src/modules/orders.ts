import express, { RequestHandler } from "express"
import { OrderStatus } from "@prisma/client"
import { redis } from "bun"
import { z } from "zod"
import { requireAuth } from "../middleware/auth"
import { createOrderSchema } from "../utils/validationSchemas"
import { prisma } from "../utils"
import { OrderError } from "../utils/errors"
import { TTL_24_HOURS } from "../utils/constants"

export const ordersRoutes = express.Router()
ordersRoutes.use(requireAuth)

const createOrder: RequestHandler<
  Record<string, never>,
  CreateOrderResponse | ApiErrorResponse,
  CreateOrderRequestBody,
  Record<string, never>,
  AuthLocals
> = async (request, response, next) => {
  try {
    const parsedBody = createOrderSchema.safeParse(request.body)

    if (!parsedBody.success) {
      response.status(400).json({
        message: "Invalid request body",
        errors: z.flattenError(parsedBody.error).fieldErrors,
      })
      return
    }

    const idempotencyKey = request.get("Idempotency-Key")

    if (!idempotencyKey) {
      response.status(400).json({ message: "Idempotency-Key header is required" })
      return
    }

    const idempotencyKeyExists = await redis.get(idempotencyKey)

    if (idempotencyKeyExists) {
      const responseBody = JSON.parse(idempotencyKeyExists) as CreateOrderResponse
      response.status(201).json(responseBody)
      return
    }

    const requestedItems = parsedBody.data.items
    const stockChecks = Array.from(
      parsedBody.data.items.reduce((itemsByProductId, item) => {
        itemsByProductId.set(
          item.productId,
          (itemsByProductId.get(item.productId) ?? 0) + item.quantity
        )

        return itemsByProductId
      }, new Map<number, number>())
    ).map(([productId, quantity]) => ({ productId, quantity }))

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: stockChecks.map((item) => item.productId) } },
        select: { id: true, stock: true },
      })

      const productsById = new Map(products.map((product) => [product.id, product]))

      for (const item of stockChecks) {
        const product = productsById.get(item.productId)

        if (!product) {
          throw new OrderError(404, `Product ${item.productId} not found`)
        }

        if (product.stock < item.quantity) {
          throw new OrderError(409, `Insufficient stock for product ${item.productId}`)
        }
      }

      for (const item of stockChecks) {
        const updatedProduct = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        })

        if (updatedProduct.count !== 1) {
          throw new OrderError(409, `Insufficient stock for product ${item.productId}`)
        }
      }

      return tx.order.create({
        data: {
          userId: response.locals.user.id,
          status: OrderStatus.PENDING,
          totalAmount: requestedItems.reduce(
            (total, item) => total + item.priceAtOrder * item.quantity,
            0
          ),
          items: {
            create: requestedItems.map((item) => {
              return {
                productId: item.productId,
                quantity: item.quantity,
                priceAtOrder: item.priceAtOrder,
              }
            }),
          },
        },
        include: {
          items: {
            select: {
              productId: true,
              quantity: true,
              priceAtOrder: true,
            },
          },
        },
      })
    })

    const paymentId = `pay_${crypto.randomUUID()}`
    const appBaseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    const responseBody: CreateOrderResponse = {
      order: {
        id: order.id,
        status: "PENDING",
        totalAmount: order.totalAmount,
        items: order.items,
      },
      payment: {
        paymentId,
        webhookUrl: `${appBaseUrl}/webhooks/payments/${paymentId}`,
      },
    }

    await redis.set(idempotencyKey, JSON.stringify(responseBody), "EX", TTL_24_HOURS.toString(), "NX")
    response.status(201).json(responseBody)
  } catch (error) {
    if (error instanceof OrderError) {
      response.status(error.statusCode).json({ message: error.message })
      return
    }

    next(error)
  }
}

const getCurrentUserOrders: RequestHandler<
  Record<string, never>,
  UserOrdersListResponse | ApiErrorResponse,
  Record<string, never>,
  Record<string, never>,
  AuthLocals
> = async (_request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: response.locals.user.id },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    response.json({ orders })
  } catch (error) {
    next(error)
  }
}

const getSingleOrderInfo: RequestHandler<
  OrderDetailParams,
  OrderDetailResponse | ApiErrorResponse,
  Record<string, never>,
  Record<string, never>,
  AuthLocals
> = async (request, response, next) => {
  try {
    const orderId = Number(request.params.id)

    if (!Number.isInteger(orderId) || orderId < 1) {
      response.status(400).json({ message: "Order id must be a positive number" })
      return
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: response.locals.user.id,
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            priceAtOrder: true,
          },
        },
      },
    })

    if (!order) {
      response.status(404).json({ message: "Order not found" })
      return
    }

    response.json({ order })
  } catch (error) {
    next(error)
  }
}

ordersRoutes.post("/", createOrder)
ordersRoutes.get("/my", getCurrentUserOrders)
ordersRoutes.get("/:id", getSingleOrderInfo)
