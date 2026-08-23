import { RequestHandler } from "express"
import jwt from "jsonwebtoken"

type JwtPayload = {
  userId: string
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error("JWT_SECRET is not configured")
  }

  return secret
}

export const requireAuth: RequestHandler = (req, res, next) => {
  try {
    const authorization = req.get("authorization")

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authorization bearer token is required" })
      return
    }

    const token = authorization.slice("Bearer ".length).trim()
    const payload = jwt.verify(token, getJwtSecret())

    if (typeof payload === "string" || typeof payload.userId !== "string") {
      res.status(401).json({ message: "Invalid token" })
      return
    }

    res.locals.user = { id: (payload as JwtPayload).userId }
    next()
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ message: "Invalid token" })
      return
    }

    next(error)
  }
}
