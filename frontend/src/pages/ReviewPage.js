import React, { useEffect, useRef, useState } from 'react';

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
  '#eab308', '#ef4444', '#8b5cf6', '#10b981'
];

function ReviewPage({ data, onConfirmed }) {
  const canvasRef = useRef(null);
  const pdfContainerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [editedValues, setEditedValues] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState(null);

  // Pripravi mapping: ključ polja → barva (globalno, ne glede na stran)
  const fieldColorMap = {};
  if (data?.results) {
    Object.keys(data.results).forEach((key, i) => {
      fieldColorMap[key] = COLORS[i % COLORS.length];
    });
  }

  useEffect(() => {
    if (!data) return;
    const initial = {};
    Object.entries(data.results || {}).forEach(([key, val]) => {
      initial[key] = val.value;
    });
    setEditedValues(initial);
  }, [data]);

  useEffect(() => {
    if (!data?.pdf_url) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      window.pdfjsLib.getDocument(data.pdf_url).promise.then(pdf => {
        setPdfDoc(pdf);
      });
    };
    document.head.appendChild(script);
  }, [data]);

  useEffect(() => {
    if (!pdfDoc) return;
    renderPage(currentPage);
  }, [pdfDoc, currentPage, highlightedKey]);

  function getPageHighlights(pageNum) {
    if (!data?.results) return [];
    return Object.entries(data.results)
      .filter(([_, val]) => val.page === pageNum && val.rectangles && val.rectangles.length > 0)
      .map(([key, val]) => ({
        key,
        ...val,
        color: fieldColorMap[key]
      }));
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(pageNum + 1);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const highlights = getPageHighlights(pageNum);
    const scale = 1.4;

    highlights.forEach(h => {
      const color = h.color;
      const isFocused = highlightedKey === h.key;

      h.rectangles.forEach(rect => {
        const { x, y, width, height } = rect;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, width * scale, height * scale);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = isFocused ? 4 : 2;
        if (isFocused) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
        }
        ctx.strokeRect(x * scale, y * scale, width * scale, height * scale);
        ctx.restore();
      });
    });
  }

  function getConfidenceColor(conf) {
    if (conf >= 0.85) return '#22c55e';
    if (conf >= 0.6) return '#f59e0b';
    return '#ef4444';
  }

  function getConfidenceLabel(conf) {
    if (conf >= 0.85) return 'Visoka';
    if (conf >= 0.6) return 'Srednja';
    return 'Nizka';
  }

  function handleConfirm() {
    console.log('Potrjeni podatki:', editedValues);
    setConfirmed(true);
  }

  function jumpToField(key) {
    const field = data.results[key];
    if (!field || field.page === null || !field.rectangles?.length) return;

    setHighlightedKey(key);

    if (field.page !== currentPage) {
      setCurrentPage(field.page);
    } else {
      // Ista stran — scroll znotraj container-ja do pravokotnika
      const rect = field.rectangles[0];
      const scale = 1.4;
      const targetY = rect.y * scale - 80;
      pdfContainerRef.current?.scrollTo({ top: targetY, behavior: 'smooth' });
    }

    // Po 2 sekundah odstrani highlight
    setTimeout(() => setHighlightedKey(null), 2500);
  }

  // Ko se zamenja stran zaradi jumpToField, scrollaj do pravokotnika
  useEffect(() => {
    if (!highlightedKey || !pdfContainerRef.current) return;
    const field = data?.results?.[highlightedKey];
    if (!field || field.page !== currentPage) return;
    const rect = field.rectangles?.[0];
    if (!rect) return;
    const scale = 1.4;
    const targetY = rect.y * scale - 80;
    setTimeout(() => {
      pdfContainerRef.current?.scrollTo({ top: targetY, behavior: 'smooth' });
    }, 100);
  }, [currentPage, highlightedKey, data]);

  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#5a6070' }}>
        Ni dokumenta za pregled. Najprej naloži in procesiraj dokument.
      </div>
    );
  }

  if (confirmed) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>✓</div>
        <div style={{ fontSize: '18px', color: '#22c55e', marginBottom: '8px' }}>
          Podatki potrjeni!
        </div>
        <div style={{ color: '#5a6070', fontSize: '13px', marginBottom: '24px' }}>
          Dokument je bil uspešno procesiran in shranjen.
        </div>
        <button
          className="btn-primary"
          onClick={() => onConfirmed && onConfirmed()}
        >
          Nov dokument →
        </button>
      </div>
    );
  }

  const results = data.results || {};
  const hasLowConfidence = Object.values(results).some(v => v.confidence < 0.75);
  const fieldKeys = Object.keys(results);
  const totalPages = pdfDoc ? pdfDoc.numPages : 1;

  return (
    <div className="review-page">

      {hasLowConfidence && (
        <div className="warning-box">
          ⚠ Agent zaznal nizko zanesljivost pri nekaterih poljih — prosim preveri označena polja.
        </div>
      )}

      <div className="review-layout">

        <div className="review-left">
          <div className="section-title" style={{ marginBottom: '12px' }}>
            Ekstrahirani podatki
          </div>

          <div className="fields-result-list">
            {fieldKeys.map((key) => {
              const field = results[key];
              const conf = field.confidence;
              const color = getConfidenceColor(conf);
              const fieldColor = fieldColorMap[key];
              const canJump = field.page !== null && field.rectangles?.length > 0;
              const isActive = highlightedKey === key;

              return (
                <div
                  key={key}
                  className={`result-field-card ${canJump ? 'clickable' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => canJump && jumpToField(key)}
                >
                  <div className="result-field-header">
                    <span
                      className="result-field-dot"
                      style={{ background: fieldColor }}
                    />
                    <span className="result-field-key">{key}</span>
                    <span className="result-conf-badge" style={{ color, borderColor: color }}>
                      {getConfidenceLabel(conf)} {Math.round(conf * 100)}%
                    </span>
                  </div>
                  <input
                    className="result-field-input"
                    style={{ borderColor: conf < 0.75 ? '#f59e0b' : '#2a2f3a' }}
                    value={editedValues[key] ?? ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditedValues({
                      ...editedValues,
                      [key]: e.target.value
                    })}
                  />
                  <div className="result-conf-bar-wrap">
                    <div className="result-conf-bar">
                      <div
                        className="result-conf-fill"
                        style={{ width: `${conf * 100}%`, background: color }}
                      />
                    </div>
                  </div>
                  {field.source_text && (
                    <div className="result-source-text">
                      Najdeno: "{field.source_text}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="review-actions">
            <button className="btn-run" onClick={handleConfirm}>
              ✓ Potrdi in shrani
            </button>
            <button className="btn-secondary">
              ✗ Zavrni
            </button>
          </div>
        </div>

        <div className="review-right">
          <div className="section-title" style={{ marginBottom: '12px' }}>
            Originalni dokument
          </div>
          <div className="pdf-container" ref={pdfContainerRef}>
            <canvas ref={canvasRef} className="pdf-canvas" />
          </div>
          {totalPages > 1 && (
            <div className="pdf-nav">
              <button
                className="btn-secondary"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                ◀ Prejšnja
              </button>
              <span style={{ color: '#9aa0b0', fontSize: '12px' }}>
                Stran {currentPage + 1} / {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={currentPage === totalPages - 1}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Naslednja ▶
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default ReviewPage;