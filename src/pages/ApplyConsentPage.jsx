import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { applicationConsentItems } from "../data/applicationConsentContent";
import { applicationConsentItemsEn } from "../data/applicationConsentContent.en";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import { buildApplyDetailPath } from "../lib/applicationFlowRoutes";

function renderInlineMarkup(text) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderConsentContent(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index].trim();

    if (!current) {
      index += 1;
      continue;
    }

    if (
      /^\|.*\|$/.test(current) &&
      index + 1 < lines.length &&
      /^\|\s*[-:| ]+\|$/.test(lines[index + 1].trim())
    ) {
      const header = parseTableRow(lines[index]);
      const rows = [];
      index += 2;

      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }

      blocks.push({
        type: "table",
        header,
        rows,
      });
      continue;
    }

    if (/^-{3,}$/.test(current)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(current)) {
      blocks.push({
        type: "section-title",
        text: current.replace(/^\d+\.\s+/, ""),
      });
      index += 1;
      continue;
    }

    if (/^-\s+/.test(current)) {
      const items = [];

      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^-\s+/, ""));
        index += 1;
      }

      blocks.push({
        type: "list",
        items,
      });
      continue;
    }

    const paragraphLines = [];

    while (index < lines.length) {
      const line = lines[index].trim();

      if (
        !line ||
        (/^\|.*\|$/.test(line) &&
          index + 1 < lines.length &&
          /^\|\s*[-:| ]+\|$/.test(lines[index + 1].trim())) ||
        /^-\s+/.test(line) ||
        /^\d+\.\s+/.test(line) ||
        /^-{3,}$/.test(line)
      ) {
        break;
      }

      paragraphLines.push(line);
      index += 1;
    }

    if (paragraphLines.length) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join(" "),
      });
      continue;
    }

    index += 1;
  }

  return blocks.map((block, blockIndex) => {
    if (block.type === "section-title") {
      return (
        <h3 className="site-consent-page__copy-section-title" key={`section-${blockIndex}`}>
          {renderInlineMarkup(block.text)}
        </h3>
      );
    }

    if (block.type === "paragraph") {
      return (
        <p className="site-consent-page__copy-paragraph" key={`paragraph-${blockIndex}`}>
          {renderInlineMarkup(block.text)}
        </p>
      );
    }

    if (block.type === "list") {
      return (
        <ul className="site-consent-page__copy-list" key={`list-${blockIndex}`}>
          {block.items.map((item, itemIndex) => (
            <li key={`list-item-${blockIndex}-${itemIndex}`}>{renderInlineMarkup(item)}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "divider") {
      return <hr className="site-consent-page__copy-divider" key={`divider-${blockIndex}`} />;
    }

    if (block.type === "table") {
      return (
        <div className="site-consent-page__table-wrap" key={`table-${blockIndex}`}>
          <table className="site-consent-page__table">
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={`table-head-${blockIndex}-${cellIndex}`}>
                    {renderInlineMarkup(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`table-row-${blockIndex}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`table-cell-${blockIndex}-${rowIndex}-${cellIndex}`}>
                      {renderInlineMarkup(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  });
}

function ConsentCopy({ content }) {
  return <div className="site-consent-page__item-copy">{renderConsentContent(content)}</div>;
}

function ConsentItem({ item, checked, isExpanded, onToggleExpand, onToggleConsent, t }) {
  return (
    <article className="site-consent-page__item">
      <button
        type="button"
        className="site-consent-page__item-header"
        onClick={() => onToggleExpand(item.key)}
        aria-expanded={isExpanded}
      >
        <span className="site-consent-page__item-title">
          {item.title}
          <span className="site-consent-page__item-badge">
            {item.required ? t("consent.required") : t("consent.optional")}
          </span>
        </span>
        <span className="site-consent-page__item-arrow">{isExpanded ? "−" : "+"}</span>
      </button>

      {isExpanded ? (
        <div className="site-consent-page__item-body">
          <ConsentCopy content={item.content} />
          <label className="site-consent-page__item-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onToggleConsent(item.key, event.target.checked)}
            />
            <span>{t("consent.checked")}</span>
          </label>
        </div>
      ) : null}
    </article>
  );
}

export function ApplyConsentPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const detailPath = buildApplyDetailPath(state.selection);
  const consentItems = locale === "en" ? applicationConsentItemsEn : applicationConsentItems;
  const [expandedKeys, setExpandedKeys] = useState(() =>
    consentItems.filter((item) => item.required).map((item) => item.key),
  );

  const requiredItems = useMemo(
    () => consentItems.filter((item) => item.required),
    [consentItems],
  );

  const allChecked = consentItems.every((item) => state.consents[item.key]);
  const requiredChecked = requiredItems.every((item) => state.consents[item.key]);

  useEffect(() => {
    setExpandedKeys((current) => {
      if (current.length) {
        return current;
      }

      return consentItems.filter((item) => item.required).map((item) => item.key);
    });
  }, [consentItems]);

  useEffect(() => {
    if (!state.draftId) {
      navigate(detailPath, { replace: true, state: { source: "consent" } });
    }
  }, [detailPath, navigate, state.draftId]);

  function toggleExpand(key) {
    setExpandedKeys((current) =>
      current.includes(key)
        ? current.filter((itemKey) => itemKey !== key)
        : [...current, key],
    );
  }

  function toggleConsent(key, value) {
    dispatch({
      type: "TOGGLE_CONSENT",
      field: key,
      value,
    });
  }

  function toggleAll(value) {
    const nextState = Object.fromEntries(
      consentItems.map((item) => [item.key, value]),
    );

    dispatch({
      type: "SET_ALL_CONSENTS",
      payload: nextState,
    });
  }

  function handleProceed() {
    if (!requiredChecked) {
      return;
    }

    dispatch({
      type: "SET_FLOW_STEP",
      value: applicationFlowSteps.REVIEW,
    });
    navigate("/apply/review");
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow site-consent-page">
        <div className="site-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">{t("common.kickerConsent")}</p>
            <h1>{t("consent.title")}</h1>
            <p>{t("consent.description")}</p>
          </div>

          <div className="site-consent-page__all">
            <label className="site-consent-page__all-check">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              <span>{t("consent.agreeAll")}</span>
            </label>
            <p>{t("consent.optionalNotice")}</p>
          </div>

          <div className="site-consent-page__items">
            {consentItems.map((item) => (
              <ConsentItem
                key={item.key}
                item={item}
                checked={Boolean(state.consents[item.key])}
                isExpanded={expandedKeys.includes(item.key)}
                onToggleExpand={toggleExpand}
                onToggleConsent={toggleConsent}
                t={t}
              />
            ))}
          </div>

          <p className="site-consent-page__service-period">
            *위 상품의 최대 이용기간은 6개월입니다
          </p>

          <div className="site-inline-actions">
            <Button
              variant="ghost"
              onClick={() => navigate(detailPath, { state: { source: "consent" } })}
            >
              {t("consent.previous")}
            </Button>
            <Button onClick={handleProceed} disabled={!requiredChecked}>
              {t("consent.next")}
            </Button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
