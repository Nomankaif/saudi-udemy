import Banner from "../models/banner.model.js";
import { ApiError } from "../utils/api-error.js";

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
      .sort({ displayOrder: 1 })
      .lean(),
  );
}

export async function listBanners(request, response) {
  response.json(await Banner.find().sort({ createdAt: -1 }).lean());
}

export async function createBanner(request, response) {
  response.status(201).json(await Banner.create(request.body));
}

export async function updateBanner(request, response) {
  const banner = await Banner.findByIdAndUpdate(
    request.params.id,
    request.body,
    { new: true, runValidators: true },
  );
  if (!banner) throw new ApiError(404, "Banner not found");
  response.json(banner);
}
