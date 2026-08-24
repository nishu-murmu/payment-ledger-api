export class OrderError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
  }
}
