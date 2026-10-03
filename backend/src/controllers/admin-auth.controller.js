import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { cookieOptions } from "../services/token.service.js";
import { ApiError } from "../utils/api-error.js";

export function adminSessionKey() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new ApiError(503, "Admin access is not configured");
  return createHash("sha256").update(`admin-session:${password}`).digest();
}

export async function adminLogin(request, response) {
  const key = adminSessionKey();
  const supplied =
    typeof request.body.password === "string" ? request.body.password : "";
  const digest = (value) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(process.env.ADMIN_PASSWORD))) {
    throw new ApiError(401, "Incorrect admin password");
  }
  const email = "platform-admin@internal.invalid";
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      firstName: "Platform",
      lastName: "Admin",
      role: "ADMIN",
      emailVerified: true,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
    });
  }
  if (!user.isActive || user.role !== "ADMIN")
    throw new ApiError(403, "Admin account is unavailable");
  const token = jwt.sign({ sub: user.id }, key, {
    algorithm: "HS256",
    audience: "admin",
    expiresIn: "2h",
  });
  response.cookie("admin_session", token, {
    ...cookieOptions,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000,
  });
  response.set("Cache-Control", "no-store").json({ success: true });
}

export function adminLogout(request, response) {
  response.clearCookie("admin_session", { ...cookieOptions, path: "/" });
  response.json({ success: true });
}

// Bounded, in-memory throttling; no Redis dependency.
const attempts = new Map();
export function limitAdminLogin(request, response, next) {
  const now = Date.now();
  for (const [ip, entry] of attempts)
    if (entry.until <= now) attempts.delete(ip);
  const ip = request.ip;
  const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 10 || attempts.size >= 10000)
    return next(
      new ApiError(429, "Too many login attempts. Try again in 15 minutes."),
    );
  entry.count++;
  attempts.set(ip, entry);
  next();
}
