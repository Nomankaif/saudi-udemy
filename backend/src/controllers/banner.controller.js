import Banner from "../models/banner.model.js";
import { ApiError } from "../utils/api-error.js";

const fields = ["type", "title", "description", "desktopImage", "mobileImage", "buttonText", "buttonUrl", "audience", "dismissible", "displayOrder", "status"];
const imagePath = /^\/uploads\/media\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function bannerInput(body, { creating = false, existing = null } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Enter banner details");
  const picked = Object.fromEntries(fields.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
  if (creating && !picked.status) picked.status = "DRAFT";
  if (creating && !picked.audience) picked.audience = "EVERYONE";
  if (creating && picked.dismissible === undefined) picked.dismissible = true;
  const combined = { ...existing, ...picked };
  if (!['ANNOUNCEMENT', 'HERO', 'IMAGE', 'POPUP'].includes(combined.type)) throw new ApiError(400, "Choose a banner type");
  if (typeof combined.title !== "string" || !combined.title.trim() || combined.title.trim().length > 160) throw new ApiError(400, "Enter a heading up to 160 characters");
  picked.title = combined.title.trim();
  for (const [key, max] of [["description", 600], ["buttonText", 40], ["buttonUrl", 500]]) {
    const value = combined[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new ApiError(400, `${key} is too long or invalid`);
    if (Object.hasOwn(picked, key)) picked[key] = value.trim();
  }
  for (const key of ["desktopImage", "mobileImage"]) {
    const value = combined[key] || "";
    if (typeof value !== "string" || (value && (!imagePath.test(value) || value.includes("..")))) throw new ApiError(400, "Upload a valid banner image");
  }
  if (combined.type === "IMAGE" && combined.status === "PUBLISHED" && !combined.desktopImage) throw new ApiError(400, "Upload an image before publishing this banner");
  if (!['DRAFT', 'PUBLISHED', 'INACTIVE'].includes(combined.status)) throw new ApiError(400, "Choose a valid banner status");
  if (!['EVERYONE', 'GUESTS', 'MEMBERS'].includes(combined.audience ?? "EVERYONE")) throw new ApiError(400, "Choose a valid audience");
  if (combined.dismissible !== undefined && typeof combined.dismissible !== "boolean") throw new ApiError(400, "Dismissible must be true or false");
  if (combined.displayOrder !== undefined && (!Number.isInteger(combined.displayOrder) || combined.displayOrder < 0 || combined.displayOrder > 9999)) throw new ApiError(400, "Display order must be between 0 and 9999");
  const url = combined.buttonUrl?.trim() || "";
  const label = combined.buttonText?.trim() || "";
  if (Boolean(url) !== Boolean(label)) throw new ApiError(400, "Provide both button text and destination, or leave both blank");
  if (url && !(url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) && !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url)) throw new ApiError(400, "Use a site path or HTTPS URL for the button destination");
  return picked;
}

export async function listActiveBanners(request, response) {
  const now = new Date();
  const audience = request.user
    ? ["EVERYONE", "MEMBERS"]
    : ["EVERYONE", "GUESTS"];
  response.json(
    await Banner.find({
      status: "PUBLISHED",
      audience: { $in: audience },
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      .select("type title description desktopImage mobileImage buttonText buttonUrl audience dismissible displayOrder")
      .lean(),
  );
}

export async function listBanners(request, response) {
  response.json(await Banner.find().sort({ createdAt: -1 }).lean());
}

export async function createBanner(request, response) {
  response.status(201).json(await Banner.create(bannerInput(request.body, { creating: true })));
}

export async function updateBanner(request, response) {
  const current = await Banner.findById(request.params.id).lean();
  if (!current) throw new ApiError(404, "Banner not found");
  const banner = await Banner.findByIdAndUpdate(
    request.params.id,
    { $set: bannerInput(request.body, { existing: current }) },
    { new: true, runValidators: true },
  );
  if (!banner) throw new ApiError(404, "Banner not found");
  response.json(banner);
}

export async function deleteBanner(request, response) {
  const banner = await Banner.findByIdAndDelete(request.params.id);
  if (!banner) throw new ApiError(404, "Banner not found");
  response.json({ deleted: true });
}
