type ApiErrorResponse = {
  message: string
  errors?: Record<string, string[] | undefined>
}

type AuthUserResponse = {
  id: string
  name: string
  email: string
  createdAt: Date
}

type RegisterRequestBody = {
  name: string
  email: string
  password: string
}

type LoginRequestBody = {
  email: string
  password: string
}

type AuthResponse = {
  token: string
  user: AuthUserResponse
}

type ProductResponse = {
  id: number
  name: string
  description: string | null
  price: number
  stock: number
}

type ProductsListResponse = {
  products: ProductResponse[]
}

type ProductDetailParams = {
  id: string
}

type ProductDetailResponse = {
  product: ProductResponse
}

type AuthLocals = {
  user: {
    id: string
  }
}

type CreateOrderItemRequest = {
  productId: number
  quantity: number
  priceAtOrder: number
}

type CreateOrderRequestBody = {
  items: CreateOrderItemRequest[]
}

type OrderItemResponse = {
  productId: number
  quantity: number
  priceAtOrder: number
}

type CreateOrderResponse = {
  order: {
    id: number
    status: "PENDING"
    totalAmount: number
    items: OrderItemResponse[]
  }
  payment: {
    paymentId: string
    webhookUrl: string
  }
}

type IdempotencyResponse = {
  id: string,
  key: string,
  responseBody: CreateOrderResponse,
  createdAt: string
}

type UserOrderStatusResponse = {
  id: number
  status: "PENDING" | "CONFIRMED" | "FAILED"
  totalAmount: number
  createdAt: Date
}

type UserOrdersListResponse = {
  orders: UserOrderStatusResponse[]
}

type OrderDetailParams = {
  id: string
}

type OrderDetailResponse = {
  order: {
    id: number
    status: "PENDING" | "CONFIRMED" | "FAILED"
    totalAmount: number
    createdAt: Date
    items: OrderItemResponse[]
  }
}
