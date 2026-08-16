import { useEffect, useId, useRef, useState } from "react";
import facebookLogo from "../../assets/facebook-logo-primary.png";
import instagramLogo from "../../assets/instagram-glyph-gradient.png";
import shareIcon from "../../assets/share-icon.png";
import xLogo from "../../assets/x-logo-black.png";
import {
  getParticipationCertificationStatus,
  submitParticipationCertification,
} from "../../lib/applicationApi";
import { Button } from "./Button";

const hashtags = "#머슬마니아 #머슬마니아코리아 #MUSCLEMANIAKOREA";

const shareCopyByType = {
  application: "2026 머슬마니아 코리아 챔피언십 참가 신청을 완료했습니다.",
  stage: "2026 머슬마니아 코리아 챔피언십 무대 서비스를 신청했습니다.",
  spectator: "2026 머슬마니아 코리아 챔피언십 참관객 신청을 완료했습니다.",
};

function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function hasValidPostUrl(value) {
  try {
    const parsedUrl = new URL(String(value || "").trim());
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

export function CompletionSharePreview({
  iconOnly = false,
  preview = false,
  type = "application",
  certificationTargets = [],
  lookupAccess = null,
  completionAccess = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [selectedTargetNumber, setSelectedTargetNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [certificationStatus, setCertificationStatus] = useState({ state: "idle", completed: false });
  const titleId = useId();
  const dialogRef = useRef(null);
  const shareCopy = `${shareCopyByType[type] || shareCopyByType.application}\n${hashtags}`;
  const shareUrl = window.location.origin;
  const selectedTarget = certificationTargets.find((target) => target.number === selectedTargetNumber) || null;
  const selectedTargetType = selectedTarget?.type || "";
  const completionAccessExpiresAt = Date.parse(completionAccess?.expiresAt || "");
  const isCompletionAccessExpired = Boolean(
    completionAccess?.token &&
    (!Number.isFinite(completionAccessExpiresAt) || completionAccessExpiresAt <= currentTime)
  );
  const hasLookupAccess = Boolean(lookupAccess?.verificationToken);
  const hasCompletionAccess = Boolean(completionAccess?.token) && !isCompletionAccessExpired;
  const canSubmit = preview || (
    Boolean(selectedTarget) &&
    (hasLookupAccess || hasCompletionAccess) &&
    hasValidPostUrl(postUrl)
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !completionAccess?.token || !Number.isFinite(completionAccessExpiresAt)) {
      return undefined;
    }

    setCurrentTime(Date.now());
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 15000);
    return () => window.clearInterval(intervalId);
  }, [completionAccess?.token, completionAccessExpiresAt, isOpen]);

  useEffect(() => {
    if (!isOpen || certificationTargets.length === 0) {
      return;
    }

    setSelectedTargetNumber((current) => (
      certificationTargets.some((target) => target.number === current)
        ? current
        : certificationTargets[0].number
    ));
  }, [certificationTargets, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedTarget) {
      return undefined;
    }

    if (preview) {
      setCertificationStatus({ state: "ready", completed: false });
      return undefined;
    }

    if (!hasLookupAccess && !hasCompletionAccess) {
      setCertificationStatus({ state: "idle", completed: false });
      return undefined;
    }

    let isActive = true;
    setCertificationStatus({ state: "loading", completed: false });

    getParticipationCertificationStatus({
      ...lookupAccess,
      certificationAccessToken: hasCompletionAccess ? completionAccess.token : "",
      targetType: selectedTarget.type,
      targetNumber: selectedTarget.number,
    })
      .then((response) => {
        if (isActive) {
          setCertificationStatus({ state: "ready", completed: response.completed === true });
        }
      })
      .catch(() => {
        if (isActive) {
          setCertificationStatus({ state: "error", completed: false });
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    completionAccess?.token,
    hasCompletionAccess,
    hasLookupAccess,
    isOpen,
    lookupAccess?.email,
    lookupAccess?.name,
    lookupAccess?.phone,
    lookupAccess?.verificationToken,
    preview,
    selectedTargetNumber,
    selectedTargetType,
  ]);

  const handleCopyHashtags = async () => {
    await copyToClipboard(hashtags);
    setCopied(true);
  };

  const handleInstagram = async () => {
    await copyToClipboard(shareCopy);
    setCopied(true);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  };

  const handleSubmitCertification = async () => {
    if (preview) {
      setSubmitMessage("미리보기에서는 참가 인증 링크가 저장되지 않습니다.");
      return;
    }

    if (!selectedTarget || !hasValidPostUrl(postUrl)) {
      setSubmitMessage("인증할 신청 건과 유효한 게시물 링크를 확인해 주세요.");
      return;
    }

    if (!hasLookupAccess && !hasCompletionAccess) {
      setSubmitMessage("참가 인증 입력 시간이 만료되었습니다. 신청 조회에서 본인 인증 후 다시 제출해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage("");

    try {
      const response = await submitParticipationCertification({
        ...lookupAccess,
        certificationAccessToken: hasCompletionAccess ? completionAccess.token : "",
        targetType: selectedTarget.type,
        targetNumber: selectedTarget.number,
        postUrl: postUrl.trim(),
      });
      setSubmitMessage(response.message || "참가 인증 게시물 링크를 저장했습니다.");
      setCertificationStatus({ state: "ready", completed: true });
      setPostUrl("");
    } catch (error) {
      setSubmitMessage(error.message || "참가 인증 게시물 링크를 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button className="site-complete-share-trigger" variant="ghost" onClick={() => setIsOpen(true)}>
        {iconOnly ? <img alt="" aria-hidden="true" src={shareIcon} /> : "공유하기"}
      </Button>

      {isOpen ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="site-completion-share-preview"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
          role="dialog"
        >
          <section className="site-completion-share-preview__panel" ref={dialogRef}>
            <p className="site-kicker">PARTICIPATION CERTIFICATION</p>
            <h2 id={titleId}>참가 인증 SNS</h2>
            <p>공유 가능한 SNS와 참가 인증 게시물은 구분해서 운영합니다.</p>

            <div className="site-completion-share-preview__channels" aria-label="SNS 공유 채널">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                rel="noreferrer"
                target="_blank"
              >
                <img alt="Facebook" src={facebookLogo} />
                <span>Facebook</span>
              </a>
              <button onClick={handleInstagram} type="button">
                <img alt="Instagram" src={instagramLogo} />
                <span>Instagram</span>
              </button>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCopy)}&url=${encodeURIComponent(shareUrl)}`}
                rel="noreferrer"
                target="_blank"
              >
                <img alt="X" src={xLogo} />
                <span>X</span>
              </a>
            </div>

            <div className="site-completion-share-preview__hashtags">
              <h3>필수 해시태그</h3>
              <p>{hashtags}</p>
              <Button
                className={copied ? "site-completion-share-preview__copy-button--complete" : ""}
                onClick={handleCopyHashtags}
                variant="ghost"
              >
                {copied ? "복사 완료" : "해시태그 복사"}
              </Button>
            </div>

            {certificationTargets.length > 1 ? (
              <label className="site-completion-share-preview__target">
                <span>인증할 신청 건</span>
                <select onChange={(event) => setSelectedTargetNumber(event.target.value)} value={selectedTargetNumber}>
                  {certificationTargets.map((target) => (
                    <option key={target.number} value={target.number}>{target.label}</option>
                  ))}
                </select>
              </label>
            ) : selectedTarget ? <p className="site-completion-share-preview__selected-target">인증 대상: <strong>{selectedTarget.label}</strong></p> : null}

            {selectedTarget && (preview || hasLookupAccess || hasCompletionAccess) ? (
              <p className="site-completion-share-preview__status">
                참가 인증 상태: <strong>
                  {certificationStatus.state === "loading"
                    ? "확인 중"
                    : certificationStatus.completed
                      ? "완료 (새 링크 제출 시 수정됩니다)"
                      : certificationStatus.state === "error"
                        ? "확인하지 못했습니다"
                        : "미완료"}
                </strong>
              </p>
            ) : null}

            {!preview && !hasLookupAccess && !hasCompletionAccess ? (
              <p className="site-completion-share-preview__access-message">
                참가 인증 입력 시간이 만료되었습니다. <a href="/lookup">신청 조회</a>에서 본인 인증 후 다시 제출해 주세요.
              </p>
            ) : null}

            <label className="site-completion-share-preview__post-url">
              <span>SNS에 게시한 후 게시물 링크를 입력해주세요.</span>
              <input
                onChange={(event) => {
                  setPostUrl(event.target.value);
                  setSubmitMessage("");
                }}
                placeholder="https://..."
                type="url"
                value={postUrl}
              />
            </label>
            {submitMessage ? <p className="site-field__hint">{submitMessage}</p> : null}

            <div className="site-completion-share-preview__actions">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>닫기</Button>
              <Button
                disabled={!canSubmit || isSubmitting}
                onClick={handleSubmitCertification}
              >
                {isSubmitting ? "저장 중" : certificationStatus.completed ? "참가 인증 수정" : "제출"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
