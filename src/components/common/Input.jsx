export function Input({
  label,
  hint,
  className = "",
  ...props
}) {
  return (
    <label className={`site-field ${className}`.trim()}>
      <span className="site-field__label">{label}</span>
      <input className="site-input" {...props} />
      {hint ? <span className="site-field__hint">{hint}</span> : null}
    </label>
  );
}
