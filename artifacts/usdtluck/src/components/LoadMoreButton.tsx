import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type LoadMoreButtonProps = Omit<ButtonProps, "children"> & {
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
};

export function LoadMoreButton({
  isLoading,
  disabled,
  label = "Load More",
  loadingLabel = "Loading…",
  className,
  ...props
}: LoadMoreButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isLoading}
      className={cn(
        "w-full sm:w-auto rounded-full px-5 h-10 text-sm",
        "border-[var(--green-border)] bg-card/30 hover:bg-card/50",
        "shadow-[0_0_0_1px_rgba(0,194,168,0.10),0_0_24px_rgba(0,194,168,0.10)] hover:shadow-[0_0_0_1px_rgba(0,194,168,0.18),0_0_32px_rgba(0,194,168,0.18)]",
        "active:scale-[0.99]",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner className="size-4 text-[var(--green)]" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        label
      )}
    </Button>
  );
}

