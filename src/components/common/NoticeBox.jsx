export function NoticeBox({ title, children }) {
  return (
    <section className="site-notice">
      <h3 className="site-notice__title">{title}</h3>
      <div className="site-notice__body">{children}</div>
    </section>
  );
}
