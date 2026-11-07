export type Banner = {
  _id: string;
  type: "ANNOUNCEMENT" | "HERO" | "IMAGE" | "POPUP";
  title: string;
  description?: string;
  desktopImage?: string;
  mobileImage?: string;
  buttonText?: string;
  buttonUrl?: string;
  audience: "EVERYONE" | "GUESTS" | "MEMBERS";
  dismissible: boolean;
  displayOrder: number;
  status?: "DRAFT" | "PUBLISHED" | "INACTIVE";
};

export async function publicBanners(): Promise<Banner[]> {
  const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/banners/active`, { cache: "no-store" });
  if (!response.ok) throw new Error("Banners are temporarily unavailable");
  return response.json();
}
