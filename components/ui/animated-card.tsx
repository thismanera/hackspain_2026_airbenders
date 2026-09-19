import * as React from "react"

import { cn } from "@/lib/core/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AnimatedCard({ className, ...props }: CardProps) {
  return (
    <div
      role="region"
      className={cn(
        "animated-card group/animated-card bg-card text-card-foreground relative w-full overflow-hidden rounded-[14px] border shadow-xs transition-all hover:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: CardProps) {
  return (
    <div
      role="group"
      className={cn(
        "flex flex-col gap-1 border-t px-4 py-4 sm:p-5 text-center",
        className
      )}
      {...props}
    />
  )
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        "text-base font-semibold tracking-[-0.01em] text-foreground",
        className
      )}
      {...props}
    />
  )
}

interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      className={cn(
        "text-muted-foreground text-xs sm:text-sm leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export function CardVisual({ className, ...props }: CardProps) {
  return (
    <div
      className={cn("h-[150px] w-full overflow-hidden relative", className)}
      {...props}
    />
  )
}
