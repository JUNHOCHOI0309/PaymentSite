export function Checkbox({
  label,
  checked,
  onChange,
  required = false,
}) {
  return (
    <label className="site-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span>
        {label}
        {required ? " (필수)" : " (선택)"}
      </span>
    </label>
  );
}
