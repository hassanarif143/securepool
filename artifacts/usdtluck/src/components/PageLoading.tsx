export function PageLoading() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <p className="font-display text-3xl sm:text-4xl font-semibold tracking-tight page-loader-logo-gradient">
          SecurePool
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
