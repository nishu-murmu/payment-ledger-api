import express, { RequestHandler } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { Prisma, PrismaClient } from "@prisma/client"
import { z } from "zod"

const prisma = new PrismaClient()
const saltRounds = 10

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Invalid email").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

const loginSchema = z.object({
  email: z.email("Invalid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
})

function getJwtSecret() {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error("JWT_SECRET is not configured")
  }

  return secret
}

function signToken(userId: string, secret = getJwtSecret()) {
  return jwt.sign({ userId }, secret, { expiresIn: "7d" })
}

export const authRoutes = express.Router()

const registerHandler: RequestHandler<
  Record<string, never>,
  AuthResponse | ApiErrorResponse,
  RegisterRequestBody
> = async (req, res, next) => {
  try {
    const parsedBody = registerSchema.safeParse(req.body)

    if (!parsedBody.success) {
      res.status(400).json({
        message: "Invalid request body",
        errors: z.flattenError(parsedBody.error).fieldErrors,
      })
      return
    }

    const { name, email, password } = parsedBody.data

    const jwtSecret = getJwtSecret()
    const hashedPassword = await bcrypt.hash(password, saltRounds)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    })

    res.status(201).json({
      token: signToken(user.id, jwtSecret),
      user,
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({ message: "Email is already registered" })
      return
    }

    next(error)
  }
}

const loginHandler: RequestHandler<
  Record<string, never>,
  AuthResponse | ApiErrorResponse,
  LoginRequestBody
> = async (req, res, next) => {
  try {
    const parsedBody = loginSchema.safeParse(req.body)

    if (!parsedBody.success) {
      res.status(400).json({
        message: "Invalid request body",
        errors: z.flattenError(parsedBody.error).fieldErrors,
      })
      return
    }

    const { email, password } = parsedBody.data

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ message: "Invalid email or password" })
      return
    }

    res.json({
      token: signToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

authRoutes.post("/register", registerHandler)
authRoutes.post("/login", loginHandler)
