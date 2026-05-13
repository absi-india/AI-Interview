type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-[102px]",
  md: "h-12 w-[124px]",
  lg: "h-20 w-[204px]",
};

export function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  return (
    <div className={`inline-flex items-center justify-center rounded-md bg-white p-1 shadow-sm ${className}`}>
      <img
        src="/absi-logo.svg"
        alt="American Business Solutions, Inc."
        className={`${SIZE_CLASS[size]} object-contain`}
      />
    </div>
  );
}
