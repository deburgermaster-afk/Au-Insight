import { Skeleton } from "@/components/ui/skeleton";

export function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="grid gap-2 rounded-2xl border p-3">
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="grid gap-6">
      <CardsSkeleton />
      <TableSkeleton />
    </div>
  );
}
