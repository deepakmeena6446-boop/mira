import { CardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <CardSkeleton lines={2} />
      <CardSkeleton lines={3} />
    </div>
  );
}
