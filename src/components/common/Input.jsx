export function Input({
  label,
  hint,
  requirement,
  className = "",
  ...props
}) {
  return (
    <label className={`site-field ${className}`.trim()}>
      <span className="site-field__label">
        {label}
        {requirement ? (
          <span className="site-field__requirement">({requirement})</span>
        ) : null}
      </span>
      <input className="site-input" {...props} />
      {hint ? <span className="site-field__hint">{hint}</span> : null}
    </label>
  );
}
