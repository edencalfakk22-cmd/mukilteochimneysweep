import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-muted border border-border",
        green: "bg-money-in-bg text-money-in",
        red: "bg-debt-bg text-debt",
        orange: "bg-warn-bg text-warn",
        blue: "bg-chips-bg text-chips",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
