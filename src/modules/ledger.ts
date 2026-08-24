import express, { RequestHandler } from "express"
import { prisma } from "../utils"
import { requireAuth } from "../middleware/auth"

export const ledgerRoutes = express.Router()
ledgerRoutes.use(requireAuth)

const myLedger: RequestHandler<
  Record<string, never>,
  LedgerHistoryResponse | ApiErrorResponse,
  Record<string, never>,
  Record<string, never>,
  AuthLocals
> = async (_request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: response.locals.user.id },
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            priceAtOrder: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    response.json({
      orders: orders.map((order) => ({
        id: order.id,
        amountPaid: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items,
      })),
    })
  } catch (error) {
    next(error)
  }
}

const ledgerSummary: RequestHandler<
  Record<string, never>,
  LedgerSummaryResponse | ApiErrorResponse,
  Record<string, never>,
  Record<string, never>,
  AuthLocals
> = async (_request, response, next) => {
  try {
    const [confirmedTotal, successfulOrders, failedOrders] = await Promise.all([
      prisma.order.aggregate({
        where: {
          userId: response.locals.user.id,
          status: "CONFIRMED",
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({
        where: {
          userId: response.locals.user.id,
          status: "CONFIRMED",
        },
      }),
      prisma.order.count({
        where: {
          userId: response.locals.user.id,
          status: "FAILED",
        },
      }),
    ])

    response.json({
      totalSpent: confirmedTotal._sum.totalAmount ?? 0,
      successfulOrders,
      failedOrders,
    })
  } catch (error) {
    next(error)
  }
}

ledgerRoutes.get("/my", myLedger)
ledgerRoutes.get("/summary", ledgerSummary)
