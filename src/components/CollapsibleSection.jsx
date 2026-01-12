import { useEffect, useMemo, useState, useId } from 'react';

export default function CollapsibleSection({
  title,
  children,
  actions,
  persistKey,
  defaultOpen = true,
}) {
  const contentId = useId();
  const storageKey = useMemo(() => (persistKey ? `collapsible:${persistKey}` : null), [persistKey]);
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved === '0') return false;
        if (saved === '1') return true;
      } catch {}
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {}
  }, [open, storageKey]);

  return (
    <div className="section">
      <div className="collapsible-header">
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Collapse section' : 'Expand section'}
        >
          <span className={`chevron ${open ? 'open' : ''}`}>▸</span>
          <span className="section-title">{title}</span>
        </button>
        {actions ? (
          <div className="collapsible-actions">{actions}</div>
        ) : null}
      </div>
      <div id={contentId} className="collapsible-content" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
