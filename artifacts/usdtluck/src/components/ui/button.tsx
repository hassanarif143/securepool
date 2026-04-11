import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[color,box-shadow,background-color,border-color,transform,filter] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:saturate-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border shadow-sm hover:bg-primary-hover hover:brightness-[1.03] active:scale-[0.99]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border border-destructive-border hover:brightness-110 active:scale-[0.99]",
        outline:
          "border border-border bg-card/40 text-foreground shadow-xs hover:bg-muted/60 hover:border-border active:shadow-none",
        secondary:
          "border bg-secondary text-secondary-foreground border-secondary-border hover:bg-secondary/90",
        ghost: "border border-transparent font-medium hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline font-medium border-0 shadow-none hover:brightness-110",
      },
      size: {
        default: "min-h-11 px-4 py-2.5 md:min-h-10 md:py-2",
        sm: "min-h-10 rounded-lg px-3.5 text-xs md:min-h-9",
        lg: "min-h-12 rounded-xl px-8 text-base md:min-h-11",
        icon: "h-11 w-11 md:h-10 md:w-10 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
