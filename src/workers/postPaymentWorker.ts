import { Queue, Worker } from 'bullmq';
import { prisma } from "../utils"

const dlq = new Queue('post-payment-dlq');

const worker = new Worker('post-payment', async (job) => {

  try {
    const { order_item } = job.data
    const product = await prisma.product.findFirst({
      where: { id: order_item.productid },
    })

    await prisma.product.update({
      where: { id: product?.id },
      data: {
        stock: product!.stock - order_item?.quantity,
        ...product
      }
    });
  } catch (error) {
    console.log(error)
  }

  console.log('Order completed:', job.data);
});

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= 3) {
    await dlq.add('failed-order', { ...job.data, error: err.message });
  }
});
