"use client";

import { useEffect, useId, useState } from "react";

type QualityRatingExplainerProps = {
  qualityLabel: string;
  qualityClassName: string;
  qualityExplanation: string;
  qualityModel: string | null;
};

export const QualityRatingExplainer = ({
  qualityLabel,
  qualityClassName,
  qualityExplanation,
  qualityModel,
}: QualityRatingExplainerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dialogId = useId();
  const dialogTitleId = useId();
  const qualityModelLabel = qualityModel?.trim() ? qualityModel : "Unavailable";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="quality-rating-trigger"
        onClick={() => setIsOpen(true)}
        aria-label={`Open quality reasoning for ${qualityLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
      >
        <span className={qualityClassName}>{qualityLabel}</span>
      </button>

      {isOpen ? (
        <div className="quality-modal-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="quality-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="quality-modal-header">
              <h3 id={dialogTitleId}>{qualityLabel}</h3>
              <button type="button" className="btn btn-secondary quality-modal-close" onClick={() => setIsOpen(false)} autoFocus>
                Close
              </button>
            </div>
            <p className="quality-modal-meta">
              <strong>Quality model:</strong> {qualityModelLabel}
            </p>
            <p className="quality-modal-explanation">{qualityExplanation}</p>
          </div>
        </div>
      ) : null}
    </>
  );
};
