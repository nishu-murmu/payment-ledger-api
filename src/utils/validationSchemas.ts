import { z } from "zod"

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Invalid email").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const loginSchema = z.object({
  email: z.email("Invalid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
})


export const webhookSchema = z.object({
  paymentId: z.string().min(1),
  orderId: z.number().int().positive(),
  status: z.enum(["success", "failure"])
})

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
      priceAtOrder: z.number().int().positive(),
    })
  ).min(1, "At least one product is required"),
})
