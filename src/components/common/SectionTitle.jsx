export function SectionTitle({ eyebrow, title, description, align = "left" }) {
  return (
    <div className={`site-section-title site-section-title--${align}`}>
      {eyebrow ? <p className="site-section-title__eyebrow">{eyebrow}</p> : null}
      <h2 className="site-section-title__heading">{title}</h2>
      {description ? <p className="site-section-title__description">{description}</p> : null}
    </div>
  );
}
