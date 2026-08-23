import express, { RequestHandler } from "express"
import { OrderStatus } from "@prisma/client"
import { redis } from "bun"
import { z } from "zod"
import { requireAuth } from "../middleware/auth"
import { createOrderSchema } from "../utils/validationSchemas"
import { prisma } from "../utils"
import { OrderError } from "../utils/errors"

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

    const idempotencyKey = request.headers["IdempotencyKey"] as string
    const idempotencyKeyExists = await redis.get(idempotencyKey)
    const responseBody = (JSON.parse(idempotencyKeyExists || "") as IdempotencyResponse).responseBody as CreateOrderResponse
    if (idempotencyKeyExists) {
      response.status(201).json(responseBody)
    }

    const requestedItems = Array.from(
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
        where: { id: { in: requestedItems.map((item) => item.productId) } },
        select: { id: true, price: true, stock: true },
      })

      const productsById = new Map(products.map((product) => [product.id, product]))

      for (const item of requestedItems) {
        const product = productsById.get(item.productId)

        if (!product) {
          throw new OrderError(404, `Product ${item.productId} not found`)
        }

        if (product.stock < item.quantity) {
          throw new OrderError(409, `Insufficient stock for product ${item.productId}`)
        }
      }

      for (const item of requestedItems) {
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
          totalAmount: requestedItems.reduce((total, item) => {
            const product = productsById.get(item.productId)

            if (!product) {
              return total
            }

            return total + product.price * item.quantity
          }, 0),
          items: {
            create: requestedItems.map((item) => {
              const product = productsById.get(item.productId)

              if (!product) {
                throw new OrderError(404, `Product ${item.productId} not found`)
              }

              return {
                productId: item.productId,
                quantity: item.quantity,
                priceAtOrder: product.price,
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
    const res = {
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

    redis.set("", JSON.stringify(res))

    response.status(201).json({
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
    })
  } catch (error) {
    if (error instanceof OrderError) {
      response.status(error.statusCode).json({ message: error.message })
      return
    }

    next(error)
  }
}

const getCurrentUserOrders = async () => {

}

const getSingleOrderInfo = async () => {

}

ordersRoutes.post("/", createOrder)
ordersRoutes.get("/my", getCurrentUserOrders)
ordersRoutes.get("/:id", getSingleOrderInfo)
