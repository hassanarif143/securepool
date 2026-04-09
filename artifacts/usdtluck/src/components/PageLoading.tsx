export function PageLoading() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4">
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/70 p-8 text-center backdrop-blur-md shadow-[0_20px_60px_-30px_rgba(0,0,0,0.75)]">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl border border-primary/35 bg-primary/10 flex items-center justify-center page-loader-orb">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.8)]" />
        </div>
        <p className="font-display text-2xl font-semibold tracking-tight page-loader-logo">
          SecurePool
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading secure experience...
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/20 via-primary to-primary/20 page-loader-track" />
        </div>
      </div>
    </div>
  );
}
