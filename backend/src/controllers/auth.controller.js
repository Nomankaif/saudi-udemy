import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  cookieOptions,
  createAccessToken,
  createRefreshToken,
} from "../services/token.service.js";

export async function register(request, response) {
  const { firstName, lastName, email, mobile, password } = request.body;
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.toLowerCase().endsWith("@internal.invalid") ||
    typeof password !== "string"
  )
    throw new ApiError(400, "Enter a valid email address and password");
  if (!firstName || !lastName || !email || !password || password.length < 8)
    throw new ApiError(
      400,
      "First name, last name, a valid email, and an 8-character password are required",
    );
  if (await User.exists({ email: email.toLowerCase() }))
    throw new ApiError(409, "An account already exists for this email");
  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    mobile: mobile || undefined,
    passwordHash: await bcrypt.hash(password, 12),
  });
  response
    .status(201)
    .json({ id: user.id, email: user.email, message: "Account created" });
}

export async function login(request, response) {
  const { email, password } = request.body;
  const user = await User.findOne({
    email: email?.toLowerCase(),
    isActive: true,
  }).select("+passwordHash +refreshTokenHash");
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
    throw new ApiError(401, "Invalid email or password");
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();
  response.cookie("access_token", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });
  response.cookie("refresh_token", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  response.json({ user: publicUser(user) });
}

export function logout(request, response) {
  response.clearCookie("access_token", cookieOptions);
  response.clearCookie("refresh_token", cookieOptions);
  response.json({ success: true });
}

export function currentUser(request, response) {
  response.json(publicUser(request.user));
}
export async function updateProfile(request, response) {
  const { firstName, lastName, mobile } = request.body;
  if (
    [firstName, lastName].some(
      (value) =>
        typeof value !== "string" || !value.trim() || value.trim().length > 80,
    )
  )
    throw new ApiError(
      400,
      "Enter a first and last name, each up to 80 characters",
    );
  if (
    typeof mobile !== "string" ||
    (mobile.trim() && !/^\+?[0-9 ()-]{7,25}$/.test(mobile.trim()))
  )
    throw new ApiError(400, "Enter a valid mobile number");
  const update = {
    $set: { firstName: firstName.trim(), lastName: lastName.trim() },
  };
  if (mobile.trim()) update.$set.mobile = mobile.trim();
  else update.$unset = { mobile: 1 };
  const user = await User.findByIdAndUpdate(request.user.id, update, {
    new: true,
    runValidators: true,
  });
  response.json(publicUser(user));
}

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    permissions: user.permissions,
  };
}
