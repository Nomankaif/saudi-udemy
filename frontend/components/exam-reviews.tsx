"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Heart, Star } from "lucide-react";
import { api, ApiError, messageOf } from "@/lib/api";
type Summary = {
  rating: number;
  count: number;
  likes: number;
  attempts: number;
  reviews: { _id: string; name: string; rating: number; comment: string }[];
};
export function ExamReviews({ examId }: { examId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [signedIn, setSignedIn] = useState(false),
    [liked, setLiked] = useState(false),
    [rating, setRating] = useState(5),
    [comment, setComment] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setData(await api<Summary>(`/exams/${examId}/feedback?page=${page}`));
  }, [examId, page]);
  useEffect(() => {
    let active = true;
    api<{ liked: boolean; rating?: number; comment?: string }>(
      `/exams/${examId}/feedback/mine`,
    )
      .then((mine) => {
        if (active) {
          setSignedIn(true);
          setLiked(mine.liked);
          setRating(mine.rating || 5);
          setComment(mine.comment || "");
        }
      })
      .catch((error) => {
        if (active && !(error instanceof ApiError && error.status === 401))
          setMessage(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, [examId]);
  useEffect(() => {
    const timer = setTimeout(
      () => void load().catch((error) => setMessage(messageOf(error))),
      0,
    );
    return () => clearTimeout(timer);
  }, [load]);
  async function save(likeOnly: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/exams/${examId}/feedback/mine`, {
        method: "PUT",
        body: JSON.stringify(
          likeOnly ? { liked: !liked } : { rating, comment },
        ),
      });
      if (likeOnly) setLiked(!liked);
      else {
        setMessage("Your review has been saved.");
        setPage(1);
      }
      await load();
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="reviews"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-bold text-slate-950">Learner reviews</h2>
      <div className="mt-5 flex items-center gap-3">
        <strong className="text-3xl text-slate-950">
          {data ? data.rating.toFixed(1) : "—"}
        </strong>
        <div className="space-y-1">
          <div
            aria-label={`${data?.rating.toFixed(1) || 0} out of 5 stars`}
            className="flex gap-0.5 text-amber-400"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                size={16}
                fill={
                  n <= Math.round(data?.rating || 0) ? "currentColor" : "none"
                }
              />
            ))}
          </div>
          <p className="text-xs text-slate-500">{data?.count || 0} reviews</p>
        </div>
      </div>
      <div className="my-5 flex flex-wrap gap-4 border-y border-slate-100 py-4 text-xs text-slate-600">
        <span>{data?.likes || 0} likes</span>
        <span>{data?.attempts || 0} attempts</span>
      </div>
      {signedIn ? (
        <div className="space-y-4">
          <button
            disabled={busy}
            aria-pressed={liked}
            onClick={() => void save(true)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50 ${liked ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-600"}`}
          >
            <Heart size={16} fill={liked ? "currentColor" : "none"} />
            {liked ? "Liked" : "Like this exam"}
          </button>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Your rating</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer text-amber-400">
                  <input
                    type="radio"
                    name={`rating-${examId}`}
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    aria-label={`${n} stars`}
                    className="peer sr-only"
                  />
                  <Star
                    size={26}
                    fill={n <= rating ? "currentColor" : "none"}
                    className="rounded peer-focus-visible:ring-2 peer-focus-visible:ring-violet-600"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-2 text-sm font-semibold">
            Your comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Share your experience with this exam…"
              className="w-full rounded-lg border border-slate-300 p-3 text-sm font-normal focus:border-violet-600 focus:outline-none"
            />
          </label>
          <button
            disabled={busy}
            onClick={() => void save(false)}
            className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save review"}
          </button>
          <p className="text-xs text-slate-500">
            One review per learner. Saving again updates your review.
          </p>
        </div>
      ) : (
        <Link
          href="/login"
          className="block rounded-lg bg-violet-50 p-3 text-center text-sm font-bold text-violet-700"
        >
          Log in to like or review
        </Link>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-slate-600">
          {message}
        </p>
      )}
      <h3 className="mt-7 text-sm font-bold">Latest reviews</h3>
      <div className="mt-3 divide-y divide-slate-100">
        {data?.reviews.map((review) => (
          <article key={review._id} className="py-4">
            <p className="break-words text-sm font-bold">{review.name}</p>
            <p
              aria-label={`${review.rating} out of 5 stars`}
              className="my-1 text-amber-500"
            >
              {"★".repeat(review.rating)}
              {"☆".repeat(5 - review.rating)}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {review.comment || "Rating only"}
            </p>
          </article>
        ))}
        {data && !data.count && (
          <p className="py-4 text-sm text-slate-500">
            No reviews yet. Be the first to share your experience.
          </p>
        )}
      </div>
      {data && data.count > 5 && (
        <div className="mt-4 flex items-center justify-between text-xs">
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
            className="font-bold disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            {page} / {Math.ceil(data.count / 5)}
          </span>
          <button
            disabled={page * 5 >= data.count || busy}
            onClick={() => setPage(page + 1)}
            className="font-bold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
