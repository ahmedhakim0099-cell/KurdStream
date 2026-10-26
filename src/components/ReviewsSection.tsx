import { useState } from 'react';
import { Star, Send, Trash2, AlertTriangle, Eye, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useReviews } from '@/lib/userData';

interface ReviewsSectionProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ckb-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ReviewsSection({ tmdbId, mediaType }: ReviewsSectionProps) {
  const { user, profile } = useAuth();
  const { reviews, loading, submitReview, deleteReview } = useReviews(tmdbId, mediaType);

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (rating === 0) { setError('تکایە ئەستێرەیەک هەڵبژێرە'); return; }
    setError(null);
    setSubmitting(true);
    const { error } = await submitReview(user.id, rating, reviewText.trim(), isSpoiler);
    setSubmitting(false);
    if (error) { setError(error); return; }
    setRating(0);
    setReviewText('');
    setIsSpoiler(false);
    setPendingNotice(true);
    setTimeout(() => setPendingNotice(false), 6000);
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb), 0.15)' }}>
          <Star className="w-5 h-5 accent-text" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">پێداچوونەوە و ڕای بینەران</h2>
          {reviews.length > 0 && (
            <p className="text-white/50 text-sm">
              {reviews.length} پێداچوونەوە • مامناوەند: {avgRating.toFixed(1)} ئەستێرە
            </p>
          )}
        </div>
      </div>

      {/* Review form */}
      {user ? (
        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8">
          <div className="flex items-center gap-3 mb-4">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-sm" style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}>
                {(profile?.username || '؟')[0]}
              </div>
            )}
            <span className="text-white font-bold text-sm">{profile?.username || 'بەکارهێنەر'}</span>
          </div>

          {/* Star selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-white/50 text-sm ml-2">ڕەتكردن:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(n)}
                className="transition-all hover:scale-125"
              >
                <Star
                  className={`w-7 h-7 ${(hoverRating || rating) >= n ? 'text-amber-400 fill-amber-400' : 'text-white/20'}`}
                />
              </button>
            ))}
          </div>

          {/* Review text */}
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="ڕەوانە پێداچوونەوەکەت بنووسە..."
            rows={3}
            dir="rtl"
            className="w-full bg-black/30 border border-white/10 text-white rounded-xl py-3 px-4 focus:outline-none text-sm resize-none mb-3"
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent-base)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />

          {/* Spoiler toggle */}
          <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={(e) => setIsSpoiler(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-white/60 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              ئەم پێداچوونەوەیە زانیاری ڕووداوەکان ئاشکرا دەکات (سپۆیل)
            </span>
          </label>

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          {pendingNotice && (
            <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-sm font-bold mb-3">
              <CheckCircle2 className="w-5 h-5" />
              پێداچوونەوەکەت نێردرا — چاوەڕێی پەسەندکردنی بەڕێوەبەرە.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            پێداچوونەوە بنێرە
          </button>
        </form>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-center">
          <p className="text-white/50 text-sm">بۆ نووسینی پێداچوونەوە، تکایە سەرەتا بچۆ ژوورەوە</p>
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin accent-text" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">هێشتا پێداچوونەوە نییە. یەکەم کەس بە!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => {
            const isRevealed = revealedSpoilers.has(review.id);
            const isOwn = user?.id === review.user_id;
            return (
              <div key={review.id} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                  {review.avatar_url ? (
                    <img src={review.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent-base), var(--accent-deep))' }}>
                      {(review.username || '؟')[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{review.username || 'بەکارهێنەر'}</span>
                        {isOwn && (
                          <button
                            onClick={() => deleteReview(review.id)}
                            className="text-white/30 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-white/30 text-xs">{formatDate(review.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star
                          key={n}
                          className={`w-3.5 h-3.5 ${n <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-white/15'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {review.review_text && (
                  review.is_spoiler && !isRevealed ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                      <p className="text-amber-400/90 text-sm flex items-center justify-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        ئەم پێداچوونەوەیە سپۆیلی تێدایە!
                      </p>
                      <button
                        onClick={() => toggleSpoiler(review.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        داگرە بۆ بینین / Click to reveal
                      </button>
                    </div>
                  ) : (
                    <p className="text-white/70 text-sm leading-relaxed" dir="rtl">
                      {review.review_text}
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
