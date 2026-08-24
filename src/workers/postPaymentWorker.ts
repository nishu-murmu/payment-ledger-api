import { Job, Queue, Worker } from "bullmq"

type PostPaymentJobData = {
  orderId: number
  userId: string
  totalAmount: number
  items: Array<{
    productId: number
    quantity: number
    priceAtOrder: number
  }>
  paymentId?: string
}

const connection = getRedisConnection()
const deadLetterQueue = new Queue("post-payment-dlq", { connection })

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

const worker = new Worker<PostPaymentJobData>(
  "post-payment",
  async (job: Job<PostPaymentJobData>) => {
    console.log("Order completed:", job.data)
  },
  { connection }
)

worker.on("failed", async (job, error) => {
  if (job && job.attemptsMade >= 3) {
    await deadLetterQueue.add(
      "failed-order",
      { ...job.data, error: error.message },
      { removeOnComplete: false, removeOnFail: false }
    )
  }
})

worker.on("error", (error) => {
  console.error("Post-payment worker error:", error)
})
