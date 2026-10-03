import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { ApiError } from "../utils/api-error.js";
import { adminSessionKey } from "../controllers/admin-auth.controller.js";
import { cookieOptions, createAccessToken } from "../services/token.service.js";

export async function requireAuth(request, response, next) {
  try {
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : null;
    const adminToken = request.cookies?.admin_session;
    const token = adminToken || request.cookies?.access_token || bearer;
    let payload;
    try {
      if (!token) throw new ApiError(401, "Authentication required");
      payload = adminToken
        ? jwt.verify(token, adminSessionKey(), { algorithms: ["HS256"], audience: "admin" })
        : jwt.verify(token, process.env.JWT_ACCESS_SECRET || "development-access-secret", { algorithms: ["HS256"] });
    } catch (error) {
      if (adminToken || !request.cookies?.refresh_token) throw error;
      const refresh = request.cookies.refresh_token;
      payload = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET || "development-refresh-secret", { algorithms: ["HS256"] });
      const account = await User.findById(payload.sub).select("+refreshTokenHash");
      if (!account?.isActive || !account.refreshTokenHash || !await bcrypt.compare(refresh, account.refreshTokenHash)) throw new ApiError(401, "Please sign in again");
      response.cookie("access_token", createAccessToken(account), { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    }
    const user = await User.findById(payload.sub).select("firstName lastName email mobile role permissions isActive");
    if (!user?.isActive) throw new ApiError(401, "Account is unavailable");
    request.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Invalid or expired session"));
  }
}

export function requireAdmin(request, response, next) {
  if (!request.user || !["ADMIN", "SUB_ADMIN"].includes(request.user.role)) return next(new ApiError(403, "Administrator access required"));
  next();
}

export function requirePermission(permission) {
  const permissions = Array.isArray(permission) ? permission : [permission];
  return function permissionMiddleware(request, response, next) {
    if (request.user?.role === "ADMIN" || permissions.some(p => request.user?.permissions?.includes(p))) return next();
    next(new ApiError(403, `Missing permission: ${permissions.join(" or ")}`));
  };
}
