import express, { RequestHandler } from "express"
import { Queue } from 'bullmq';
import dotenv from "dotenv"
import crypto from "crypto"
import { prisma } from "../utils"
import { webhookSchema } from "../utils/validationSchemas"
import z from "zod";
dotenv.config()

export const webhooksRoutes = express.Router()

const confirmSignature = (req, res) => {
  const verifiedSignature = req.headers["x-signature-sha256"];
  const conirmedSignature = crypto.createHmac("sha256", process.env.SECRET_KEY).update(req.rawBody).digest("hex")

  const trustedBuffer = Buffer.from(conirmedSignature)
  const receivedBuffer = Buffer.from(verifiedSignature)
  if (trustedBuffer.length != receivedBuffer.length) {
    return res.status(401).json({
      error: "Invalid signature length"
    })
  }
  const isValid = crypto.timingSafeEqual(trustedBuffer, receivedBuffer)
  if (!isValid) {

    return res.status(401).json({
      error: "Invalid signature"
    })
  }
}

const paymentConfirmationWebhook: RequestHandler<
  Record<string, never>,
  WebhookResponseBody | ApiErrorResponse,
  WebhookRequestBody
> = async (request, response, next) => {
  try {
    const isConfirmed = confirmSignature(request, response)
    if (isConfirmed) {
      const postPaymentQueue = new Queue('post-payment');
      const parsedBody = webhookSchema.safeParse(request.body)

      if (!parsedBody.success) {
        response.status(400).json({
          message: "Invalid request body",
          errors: z.flattenError(parsedBody.error).fieldErrors,
        })
        return
      }
      const { paymentId, orderId, status } = parsedBody.data

      const order = await prisma.order.findFirst({
        where: { id: orderId },
      })
      if (status == "success") {
        postPaymentQueue.add('order', {
          orderId,
          userId: order?.userId,
          paymentId
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnFail: false
        });

      } else {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: "FAILED",
            ...order
          }
        });
      }
    }
  } catch (error) {
    next(error)
  }
}

webhooksRoutes.post("/payment", paymentConfirmationWebhook)
