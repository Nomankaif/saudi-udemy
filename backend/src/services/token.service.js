import jwt from "jsonwebtoken";

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, permissions: user.permissions },
    process.env.JWT_ACCESS_SECRET || "development-access-secret",
    { expiresIn: "15m" },
  );
}

export function createRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET || "development-refresh-secret",
    { expiresIn: "7d" },
  );
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};
