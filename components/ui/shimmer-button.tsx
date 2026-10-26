import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react"

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "rgba(0, 0, 0, 1)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={className || "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/10 px-6 py-3 whitespace-nowrap text-white"}
        ref={ref}
        {...props}
      >
        <span className="absolute inset-0 overflow-visible -z-30 blur-[2px]">
          <span className="absolute inset-0 w-auto h-[100cqh] rounded-none animate-shimmer-slide [mask:none] [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
        </span>
        <span className="relative z-10">{children}</span>
        <span className="absolute inset-0 rounded-[inherit] bg-inherit shadow-[inset_0_-8px_10px_#ffffff1f] group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f] transition-all duration-300" />
        <span className="absolute inset-0.5 rounded-[inherit] -z-20 bg-[var(--bg)]" />
      </button>
    )
  }
)
ShimmerButton.displayName = "ShimmerButton"
