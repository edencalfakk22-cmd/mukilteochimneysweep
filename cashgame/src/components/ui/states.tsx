import * as React from "react";
import { FileQuestion, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-border p-10 text-center", className)}>
      <FileQuestion className="h-10 w-10 text-muted" aria-hidden />
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 rounded-card border border-debt/30 bg-debt-bg p-8 text-center", className)}
    >
      <AlertTriangle className="h-8 w-8 text-debt" aria-hidden />
      <p className="font-medium text-debt">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          נסה שוב
        </Button>
      )}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-label="טוען..." role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-card bg-border/60" />
      ))}
    </div>
  );
}
