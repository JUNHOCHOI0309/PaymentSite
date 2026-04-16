export function Button({
  children,
  variant = "primary",
  type = "button",
  className = "",
  ...props
}) {
  return (
    <button
      type={type}
      className={`site-button site-button--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
