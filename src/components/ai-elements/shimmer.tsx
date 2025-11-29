"use client";

import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

interface ShimmerProps<T extends ElementType = "p"> {
  as?: T;
  children: ReactNode;
  className?: string;
}

export function Shimmer<T extends ElementType = "p">({
  as,
  children,
  className,
  ...props
}: ShimmerProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ShimmerProps<T>>) {
  const Component = as || "p";

  return (
    <Component
      className={cn(
        "relative inline-block bg-clip-text text-transparent bg-gradient-to-r from-slate-400 via-slate-600 to-slate-400 bg-[length:200%_100%] animate-shimmer",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
