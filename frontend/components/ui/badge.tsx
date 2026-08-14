import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}) {
  const styles = {
    default: "bg-brand text-white",
    secondary: "bg-surface-muted text-brand",
    success: "bg-surface-muted text-brand-deep",
    warning: "bg-[#F1F5F9] text-[#475569]",
    destructive: "bg-red-50 text-red-700",
    outline: "border border-[var(--border-subtle)] bg-white text-foreground",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors duration-200",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
