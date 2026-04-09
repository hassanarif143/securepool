export function PageLoading() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/70 bg-card/75 p-8 text-center backdrop-blur-md shadow-[0_30px_80px_-38px_rgba(0,0,0,0.85)]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -left-8 top-1/3 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -right-8 bottom-1/4 h-24 w-24 rounded-full bg-cyan-400/15 blur-2xl" />

        <div className="relative mx-auto mb-5 h-16 w-16">
          <div className="absolute inset-0 rounded-full border border-primary/25 page-loader-orbit" />
          <div className="absolute inset-2 rounded-full border border-primary/20 page-loader-orbit-rev" />
          <div className="absolute inset-[14px] rounded-2xl border border-primary/35 bg-primary/10 flex items-center justify-center page-loader-orb">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.9)]" />
          </div>
        </div>

        <p className="font-display text-2xl font-semibold tracking-tight page-loader-logo-gradient">SecurePool</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Preparing your secure dashboard...
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted/70 border border-border/50">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/10 via-primary to-cyan-300/60 page-loader-track" />
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 page-loader-dot-1" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 page-loader-dot-2" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70 page-loader-dot-3" />
        </div>
      </div>
    </div>
  );
}
