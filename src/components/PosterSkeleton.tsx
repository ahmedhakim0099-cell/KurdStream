export function PosterSkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/5 bg-white/5 w-[112px] sm:w-[130px] md:w-[150px] flex-shrink-0">
      <div className="aspect-[2/3] w-full shimmer-bg" />
      <div className="p-2 space-y-1.5">
        <div className="h-2.5 w-3/4 rounded shimmer-bg" />
        <div className="h-2 w-1/2 rounded shimmer-bg" />
      </div>
    </div>
  );
}

export function PosterSkeletonGrid({ count = 14 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 lg:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-white/5 bg-white/5">
          <div className="aspect-[2/3] w-full shimmer-bg" />
          <div className="p-2 space-y-1.5">
            <div className="h-2.5 w-3/4 rounded shimmer-bg" />
            <div className="h-2 w-1/2 rounded shimmer-bg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCarouselRow({ title }: { title: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-40 rounded shimmer-bg" />
      </div>
      <div className="flex gap-2.5 overflow-hidden pb-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <PosterSkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
