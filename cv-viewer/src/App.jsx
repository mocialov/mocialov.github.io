import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * CV Viewer – loads an exported CV HTML file and displays it with all
 * original graphics, colors, and layout.
 *
 * Usage:
 *   1. Place the exported HTML as  public/cv.html  → auto-loaded on start.
 *   2. Or drag-and-drop / pick the file at runtime.
 *
 * The embedded JSON data from <script id="cv-data"> is also extracted and
 * available for programmatic use.
 */
export default function App() {
  const [cvHtml, setCvHtml] = useState(null);      // full HTML string
  const [cvStyles, setCvStyles] = useState('');     // extracted <style> content
  const [cvBody, setCvBody] = useState('');         // extracted <body> innerHTML
  const [cvData, setCvData] = useState(null);       // parsed JSON data
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef(null);

  // ---- Parse an HTML string from the exported file ----
  const parseExportedHtml = useCallback((html, name) => {
    setCvHtml(html);
    setFileName(name || 'cv.html');

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract all <style> blocks
    const styles = Array.from(doc.querySelectorAll('style'))
      .map(s => s.textContent)
      .join('\n');
    setCvStyles(styles);

    // Extract body content (minus the JSON <script>)
    const jsonScript = doc.getElementById('cv-data');
    if (jsonScript) {
      try { setCvData(JSON.parse(jsonScript.textContent)); } catch { /* ignore */ }
      jsonScript.remove();
    }
    setCvBody(doc.body.innerHTML);
  }, []);

  // ---- Try auto-loading public/cv.html on mount ----
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}cv.html`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(html => parseExportedHtml(html, 'cv.html'))
      .catch(() => { /* no bundled file – user must upload */ })
      .finally(() => setLoading(false));
  }, [parseExportedHtml]);

  // ---- File handling ----
  const handleFile = (file) => {
    if (!file || !file.name.endsWith('.html')) return;
    const reader = new FileReader();
    reader.onload = (e) => parseExportedHtml(e.target.result, file.name);
    reader.readAsText(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ---- Render ----
  if (loading) {
    return (
      <div className="viewer-center">
        <div className="viewer-spinner" />
        <p>Loading CV…</p>
      </div>
    );
  }

  // No CV loaded yet → show upload / drop zone
  if (!cvBody) {
    return (
      <div className="viewer-center">
        <div
          ref={dropRef}
          className={`viewer-drop${dragging ? ' viewer-drop--active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div className="viewer-drop__icon">📄</div>
          <h1 className="viewer-drop__title">CV Viewer</h1>
          <p className="viewer-drop__text">
            Drag &amp; drop your exported <strong>CV HTML file</strong> here
          </p>
          <span className="viewer-drop__or">or</span>
          <label className="viewer-drop__btn">
            Choose File
            <input
              type="file"
              accept=".html"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          <p className="viewer-drop__hint">
            Export from the LinkedIn CV app using the <em>💾&nbsp;Export CV (HTML)</em> button
          </p>
        </div>
      </div>
    );
  }

  // CV loaded → render it
  return (
    <div className="viewer-root">
      {/* Toolbar */}
      <div className="viewer-toolbar">
        <span className="viewer-toolbar__file">📄 {fileName}</span>
        <div className="viewer-toolbar__actions">
          {cvData && (
            <button
              className="viewer-btn viewer-btn--secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(cvData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'cv-data.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              📋 Download JSON
            </button>
          )}
          <button
            className="viewer-btn"
            onClick={() => window.print()}
          >
            🖨️ Print
          </button>
          <label className="viewer-btn viewer-btn--secondary">
            📂 Load Different File
            <input
              type="file"
              accept=".html"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      {/* Injected styles from the exported HTML */}
      <style dangerouslySetInnerHTML={{ __html: cvStyles }} />

      {/* CV content */}
      <div
        className="viewer-cv"
        dangerouslySetInnerHTML={{ __html: cvBody }}
      />
    </div>
  );
}
