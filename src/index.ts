import dotenv from "dotenv"
import { authRoutes } from "./modules/auth"
import { productsRoutes } from "./modules/products"
import { ordersRoutes } from "./modules/orders"
import { webhooksRoutes } from "./modules/webhooks"
import { ledgerRoutes } from "./modules/ledger"
import express, { Express } from "express"
dotenv.config();

export const app: Express = express();
const port = Number(process.env.PORT) || 3000

app.use(express.json({
  verify: (req, _res, buf) => {
    (req as express.Request).rawBody = Buffer.from(buf)
  },
}))

app.get("/", (_, res) => {
  res.send({
    message: "App is running successfully!",
  })
})

app.use("/auth", authRoutes);
app.use("/products", productsRoutes);
app.use("/orders", ordersRoutes);
app.use("/webhooks", webhooksRoutes);
app.use("/ledger", ledgerRoutes);

if (process.env.NODE_ENV !== "test") {
  const host = "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`Server listening on ${port}`)
  })
}
