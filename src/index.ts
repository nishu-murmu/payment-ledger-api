import dotenv from "dotenv"
import express, { Express } from "express"
dotenv.config();

const app: Express = express();
const port = Number(process.env.PORT) || 3000

app.get("/", (_, res) => {
  res.send({
    message: "App is running successfully!",
  })
})

const host = "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Server listening on ${port}`)
})
