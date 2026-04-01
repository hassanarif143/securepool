import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

/* ── Types ── */
interface Review {
  id: number;
  userName: string;
  message: string;
  rating: number;
  isWinner: boolean;
  poolTitle: string | null;
  prize: number | null;
  createdAt: string;
}

/* ── Helpers ── */
function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

/* ── Star rating component (display) ── */
function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`w-4 h-4 ${s <= value ? "text-yellow-400" : "text-muted/30"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

/* ── Interactive star picker ── */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
          className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
        >
          <svg
            className={`w-7 h-7 transition-colors ${
              s <= (hovered || value) ? "text-yellow-400" : "text-muted/30"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm text-muted-foreground self-center">
          {["", "Poor", "Fair", "Good", "Great", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

/* ── Single review card ── */
function ReviewCard({ review }: { review: Review }) {
  return (
    <div
      className="rounded-2xl p-5 transition-all hover:bg-white/[0.02]"
      style={{ border: "1px solid hsl(217,28%,16%)", background: "hsl(222,30%,9%)" }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: review.isWinner
              ? "hsla(45,100%,50%,0.12)"
              : "hsla(152,72%,44%,0.1)",
            border: review.isWinner
              ? "1px solid hsla(45,100%,50%,0.3)"
              : "1px solid hsla(152,72%,44%,0.2)",
            color: review.isWinner ? "#facc15" : "#4ade80",
          }}
        >
          {getInitial(review.userName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{review.userName}</span>

            {/* Verified winner badge */}
            {review.isWinner && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "hsla(45,100%,50%,0.12)",
                  border: "1px solid hsla(45,100%,50%,0.3)",
                  color: "#fbbf24",
                }}
              >
                🏆 Verified Winner
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <Stars value={review.rating} />
            <span className="text-[11px] text-muted-foreground">{timeAgo(review.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-foreground/90 leading-relaxed mb-3">{review.message}</p>

      {/* Winner context pill */}
      {review.isWinner && review.poolTitle && (
        <div
          className="inline-flex items-center gap-2 text-xs rounded-xl px-3 py-1.5"
          style={{
            background: "hsla(45,100%,50%,0.07)",
            border: "1px solid hsla(45,100%,50%,0.2)",
          }}
        >
          <span className="text-yellow-400">🎱</span>
          <span className="text-muted-foreground">Won in</span>
          <span className="font-semibold text-yellow-400/90">{review.poolTitle}</span>
          {review.prize && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-yellow-400">+{review.prize} USDT</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Write review form ── */
function WriteReviewForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return toast({ title: "Please select a star rating", variant: "destructive" });
    if (message.trim().length < 10) return toast({ title: "Message must be at least 10 characters", variant: "destructive" });

    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: message.trim(), rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit review");
      toast({ title: "Review shared! Thank you 🎉" });
      onSuccess();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "linear-gradient(135deg, hsla(152,72%,44%,0.06), hsla(200,80%,55%,0.04))",
        border: "1px solid hsla(152,72%,44%,0.2)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">✍️</span>
        <h3 className="font-semibold text-base">Share Your Experience</h3>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* Star picker */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wide">
            Your Rating
          </label>
          <StarPicker value={rating} onChange={setRating} />
        </div>

        {/* Message */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium uppercase tracking-wide">
            Your Story
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Tell others about your experience with SecurePool..."
            className="w-full rounded-xl px-4 py-3 text-sm bg-background/60 border border-border focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none resize-none transition-colors placeholder:text-muted-foreground/50"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-muted-foreground">Min 10 characters</span>
            <span className={`text-[11px] ${message.length > 450 ? "text-yellow-400" : "text-muted-foreground"}`}>
              {message.length}/500
            </span>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || !rating || message.trim().length < 10}
          className="w-full font-semibold"
          style={{
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            boxShadow: "0 2px 12px rgba(22,163,74,0.3)",
          }}
        >
          {loading ? "Sharing..." : "Share Review"}
        </Button>
      </form>
    </div>
  );
}

/* ── Summary rating bar ── */
function RatingSummary({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct: Math.round((reviews.filter((r) => r.rating === star).length / reviews.length) * 100),
  }));

  return (
    <div
      className="rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6"
      style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
    >
      {/* Big avg */}
      <div className="text-center shrink-0">
        <div className="text-5xl font-extrabold text-yellow-400 leading-none">{avg.toFixed(1)}</div>
        <Stars value={Math.round(avg)} />
        <p className="text-xs text-muted-foreground mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Bar chart */}
      <div className="flex-1 w-full space-y-1.5">
        {counts.map(({ star, count, pct }) => (
          <div key={star} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{star}</span>
            <svg className="w-3 h-3 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/5">
              <div
                className="h-full rounded-full bg-yellow-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function ReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasReviewed, setHasReviewed] = useState(false);

  async function loadReviews() {
    try {
      const res = await fetch("/api/reviews?limit=50", { credentials: "include" });
      const data = await res.json();
      setReviews(data.reviews ?? []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  async function checkHasReviewed() {
    if (!user) return;
    try {
      const res = await fetch("/api/reviews/mine", { credentials: "include" });
      const data = await res.json();
      setHasReviewed(data.hasReviewed);
    } catch {
      setHasReviewed(false);
    }
  }

  useEffect(() => {
    loadReviews();
    checkHasReviewed();
  }, [user]);

  function onReviewSubmitted() {
    setHasReviewed(true);
    loadReviews();
  }

  const winnerReviews = reviews.filter((r) => r.isWinner);
  const totalWinners = winnerReviews.length;

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* ── Hero ── */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsla(152,72%,44%,0.07) 0%, transparent 70%)" }}
        />
        <div className="relative text-center pt-6 pb-2">
          <div className="text-5xl mb-3">💬</div>
          <h1 className="text-3xl font-bold mb-2">What Winners Say</h1>
          <p className="text-muted-foreground">
            Real stories from real users — verified winners share their experience
          </p>
        </div>
      </div>

      {/* ── Trust stats ── */}
      {!loading && reviews.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Reviews", value: reviews.length, icon: "📝" },
            { label: "Winner Reviews", value: totalWinners, icon: "🏆" },
            {
              label: "Avg Rating",
              value: (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) + " ★",
              icon: "⭐",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl text-center px-3 py-4"
              style={{ background: "hsl(222,30%,10%)", border: "1px solid hsl(217,28%,16%)" }}
            >
              <div className="text-xl mb-1">{stat.icon}</div>
              <p className="text-lg font-bold text-primary">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Rating summary ── */}
      {!loading && reviews.length > 0 && <RatingSummary reviews={reviews} />}

      {/* ── Write form — shown to logged-in users who haven't reviewed yet ── */}
      {user && !loading && !hasReviewed && (
        <WriteReviewForm onSuccess={onReviewSubmitted} />
      )}

      {/* ── Already reviewed note ── */}
      {user && !loading && hasReviewed && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3 text-sm"
          style={{ background: "hsla(152,72%,44%,0.07)", border: "1px solid hsla(152,72%,44%,0.2)" }}
        >
          <span className="text-xl">✅</span>
          <span className="text-muted-foreground">You've shared your review — thank you for helping others trust SecurePool!</span>
        </div>
      )}

      {/* ── Login nudge ── */}
      {!user && !loading && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3 text-sm"
          style={{ background: "hsl(222,30%,9%)", border: "1px solid hsl(217,28%,16%)" }}
        >
          <span className="text-xl">🔐</span>
          <span className="text-muted-foreground">
            <a href="/login" className="text-primary hover:underline font-medium">Sign in</a> to share your own experience
          </span>
        </div>
      )}

      {/* ── Reviews feed ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">💬</div>
            <p className="font-semibold text-lg mb-1">No reviews yet</p>
            <p className="text-muted-foreground text-sm">
              Be the first to share your experience with SecurePool!
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2">
              Community Reviews
            </span>
            <div className="h-px flex-1" style={{ background: "hsl(217,28%,16%)" }} />
          </div>

          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {reviews.length} review{reviews.length !== 1 ? "s" : ""} · {totalWinners} verified winner{totalWinners !== 1 ? "s" : ""}
          </p>
        </>
      )}
    </div>
  );
}
