import { useLanguage } from "../../context/LanguageContext";

export function Checkbox({
  label,
  checked,
  onChange,
  required = false,
}) {
  const { t } = useLanguage();

  return (
    <label className="site-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span>
        {label}
        {required ? ` (${t("common.required")})` : ` (${t("common.optional")})`}
      </span>
    </label>
  );
}
