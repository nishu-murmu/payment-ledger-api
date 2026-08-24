import crypto from "crypto"
import express, { RequestHandler } from "express"
import { Queue } from "bullmq"
import { z } from "zod"
import { prisma } from "../utils"
import { webhookSchema } from "../utils/validationSchemas"

export const webhooksRoutes = express.Router()

const postPaymentQueue = new Queue("post-payment", {
  connection: getRedisConnection(),
})

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    return { host: "127.0.0.1", port: 6379 }
  }

  const url = new URL(redisUrl)

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
  }
}

function verifyPaymentSignature(request: Parameters<RequestHandler>[0]) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET
  const signature = request.get("x-signature-sha256")
  const rawBody = request.rawBody

  if (!secret || !signature || !rawBody) {
    return false
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")

  const expectedBuffer = Buffer.from(expectedSignature, "hex")
  const receivedBuffer = Buffer.from(signature, "hex")

  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

const paymentConfirmationWebhook: RequestHandler<
  Record<string, never>,
  WebhookResponseBody | ApiErrorResponse,
  WebhookRequestBody
> = async (request, response, next) => {
  try {
    if (!verifyPaymentSignature(request)) {
      response.status(401).json({ message: "Invalid signature" })
      return
    }

    const parsedBody = webhookSchema.safeParse(request.body)

    if (!parsedBody.success) {
      response.status(400).json({
        message: "Invalid request body",
        errors: z.flattenError(parsedBody.error).fieldErrors,
      })
      return
    }

    const { paymentId, orderId, status } = parsedBody.data

    if (status === "failure") {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "FAILED" },
      })

      response.json({ message: "Payment failure processed" })
      return
    }

    const confirmedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          status: "PENDING",
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

      if (!order) {
        return null
      }

      for (const item of order.items) {
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
          throw new Error(`Insufficient stock for product ${item.productId}`)
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: "CONFIRMED" },
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

    if (!confirmedOrder) {
      response.status(404).json({ message: "Pending order not found" })
      return
    }

    await postPaymentQueue.add(
      "completed-order",
      {
        orderId: confirmedOrder.id,
        userId: confirmedOrder.userId,
        totalAmount: confirmedOrder.totalAmount,
        items: confirmedOrder.items,
        paymentId,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    )

    response.json({ message: "Payment success processed" })
  } catch (error) {
    next(error)
  }
}

webhooksRoutes.post("/payment", paymentConfirmationWebhook)
