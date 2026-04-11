interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const iconDim = { xs: 22, sm: 26, md: 30, lg: 38 }[size];
  const textCls = { xs: "text-sm", sm: "text-sm", md: "text-base", lg: "text-xl" }[size];

  return (
    <div className="flex items-center gap-2 select-none">
      {/* Shield logo mark */}
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 32 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Shield body */}
        <path
          d="M16 1L3 6.5V17C3 25.5 9.5 32.5 16 35C22.5 32.5 29 25.5 29 17V6.5L16 1Z"
          fill="url(#sp-shield-grad)"
        />
        {/* Lock body (rectangle) */}
        <rect x="11" y="18" width="10" height="9" rx="1.5" fill="white" fillOpacity="0.92" />
        {/* Lock shackle (arch) */}
        <path
          d="M13 18V15C13 13.34 14.34 12 16 12C17.66 12 19 13.34 19 15V18"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.92"
        />
        {/* Keyhole dot */}
        <circle cx="16" cy="22.5" r="1.5" fill="url(#sp-shield-grad)" />
        <defs>
          <linearGradient id="sp-shield-grad" x1="3" y1="1" x2="29" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22c55e" />
            <stop offset="1" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>

      {showText && (
        <span className={`font-extrabold tracking-tight leading-none ${textCls}`}>
          Secure<span style={{ color: "hsl(142,71%,55%)" }}>Pool</span>
        </span>
      )}
    </div>
  );
}
