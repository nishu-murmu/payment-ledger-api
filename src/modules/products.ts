import express, { RequestHandler } from "express"
import { requireAuth } from "../middleware/auth"
import { prisma } from "../utils"

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  stock: true,
} as const

export const productsRoutes = express.Router()

productsRoutes.use(requireAuth)

const listProductsHandler: RequestHandler<
  Record<string, never>,
  ProductsListResponse | ApiErrorResponse
> = async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({
      select: productSelect,
      orderBy: { createdAt: "desc" },
    })

    response.json({ products })
  } catch (error) {
    next(error)
  }
}

const getProductHandler: RequestHandler<
  ProductDetailParams,
  ProductDetailResponse | ApiErrorResponse
> = async (request, response, next) => {
  try {
    const productId = Number(request.params.id)

    if (!Number.isInteger(productId) || productId < 1) {
      response.status(400).json({ message: "Product id must be a positive number" })
      return
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: productSelect,
    })

    if (!product) {
      response.status(404).json({ message: "Product not found" })
      return
    }

    response.json({ product })
  } catch (error) {
    next(error)
  }
}

productsRoutes.get("/", listProductsHandler)
productsRoutes.get("/:id", getProductHandler)
