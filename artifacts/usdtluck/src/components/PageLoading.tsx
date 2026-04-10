import { Skeleton } from "@/components/ui/skeleton";

/** Lightweight full-page shell while auth / critical data loads. */
export function PageLoading() {
  return (
    <div className="page-container animate-in fade-in duration-200">
      <div className="space-y-6 pb-16 pt-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-9 w-48 max-w-full rounded-lg" />
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-52 rounded-2xl md:col-span-2" />
          <div className="space-y-3">
            <Skeleton className="h-[4.5rem] rounded-2xl" />
            <Skeleton className="h-[4.5rem] rounded-2xl" />
            <Skeleton className="h-[4.5rem] rounded-2xl" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    </div>
  );
}
