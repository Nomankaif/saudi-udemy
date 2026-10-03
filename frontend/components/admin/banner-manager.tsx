"use client";
import { useState } from "react";
import { Eye, ImageIcon, Plus } from "lucide-react";
type Banner = {
  id: number;
  title: string;
  type: string;
  audience: string;
  status: string;
};
const input =
  "mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-violet-600";
export function BannerManager() {
  const [open, setOpen] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([
    {
      id: 1,
      title: "New practice exams are now available",
      type: "Announcement",
      audience: "Everyone",
      status: "Published",
    },
    {
      id: 2,
      title: "Prepare smarter for your next certification",
      type: "Hero",
      audience: "Everyone",
      status: "Published",
    },
  ]);
  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBanners([
      ...banners,
      {
        id: Date.now(),
        title: String(data.get("title")),
        type: String(data.get("type")),
        audience: "Everyone",
        status: "Draft",
      },
    ]);
    setOpen(false);
  }
  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
            Website content
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
            Banners & announcements
          </h1>
          <span className="mt-2 block text-slate-600">
            Control what visitors see as soon as they land.
          </span>
        </div>
        <button
          className="flex items-center justify-center gap-2 bg-violet-700 px-5 py-3 font-bold text-white"
          onClick={() => setOpen(true)}
        >
          <Plus size={18} />
          Create banner
        </button>
      </div>
      <div className="space-y-4">
        {banners.map((banner) => (
          <article
            className="grid gap-5 border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[88px_1fr_auto_auto] sm:items-center"
            key={banner.id}
          >
            <div className="flex size-20 items-center justify-center bg-violet-100 text-violet-700">
              <ImageIcon />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-extrabold uppercase tracking-wider text-violet-600">
                {banner.type}
              </span>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                {banner.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Audience: {banner.audience}
              </p>
            </div>
            <span
              className={`w-fit px-2.5 py-1 text-xs font-bold ${banner.status === "Published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
            >
              {banner.status}
            </span>
            <button className="flex items-center justify-center gap-2 border border-slate-900 px-4 py-2 text-sm font-bold">
              <Eye size={16} />
              Preview
            </button>
          </article>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-5">
          <form
            className="w-full max-w-xl space-y-5 bg-white p-7 shadow-2xl"
            onSubmit={add}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-violet-600">
                New content
              </p>
              <h2 className="mt-2 text-2xl font-extrabold">Create banner</h2>
            </div>
            <label className="block text-sm font-bold">
              Banner type
              <select className={input} name="type">
                <option>Announcement</option>
                <option>Hero</option>
                <option>Image</option>
                <option>Popup</option>
              </select>
            </label>
            <label className="block text-sm font-bold">
              Heading
              <input className={input} name="title" required />
            </label>
            <label className="block text-sm font-bold">
              Description
              <textarea className={input} rows={3} />
            </label>
            <label className="block text-sm font-bold">
              Button text
              <input className={input} />
            </label>
            <label className="block text-sm font-bold">
              Button destination
              <input className={input} placeholder="/exams" />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="border border-slate-900 px-5 py-2.5 font-bold"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="bg-violet-700 px-5 py-2.5 font-bold text-white">
                Save draft
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
