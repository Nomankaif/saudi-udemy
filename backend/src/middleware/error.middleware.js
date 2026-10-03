export function notFoundHandler(request, response) {
  response.status(404).json({ message: `Route ${request.method} ${request.originalUrl} was not found` });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  const statusCode = error.statusCode || (error.code === 11000 ? 409 : ["ValidationError", "CastError", "MulterError"].includes(error.name) ? 400 : 500);
  const body = { message: error.code === 11000 ? "This record already exists. Refresh and try again." : statusCode === 500 ? "The server could not complete this request." : error.message };
  if (error.details) body.details = error.details;
  if (process.env.NODE_ENV !== "production" && statusCode === 500) body.stack = error.stack;
  response.status(statusCode).json(body);
}
