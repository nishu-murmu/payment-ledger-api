import dotenv from "dotenv"
import { authRoutes } from "./modules/auth"
import { productsRoutes } from "./modules/products"
import express, { Express } from "express"
dotenv.config();

export const app: Express = express();
const port = Number(process.env.PORT) || 3000

app.use(express.json())

app.get("/", (_, res) => {
  res.send({
    message: "App is running successfully!",
  })
})

app.use("/auth", authRoutes);
app.use("/products", productsRoutes);

const host = "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Server listening on ${port}`)
})
