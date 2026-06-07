import React, { useEffect, useState } from 'react';
import axios from 'axios';

function BatchResultsPage({ batchId, onBack, onOpenDocument }) {
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  async function handleOpenDocument(docId) {
    try {
      const response = await axios.get(`http://localhost:8000/api/documents/${docId}`);
      if (response.data.error) {
        alert(response.data.error);
        return;
      }
      if (onOpenDocument) onOpenDocument(response.data);
    } catch (err) {
      alert('Napaka pri odpiranju dokumenta.');
    }
  }


  useEffect(() => {
    if (batchId) loadBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function loadBatch() {
    setLoading(true);
    try {
      const response = await axios.get(`http://localhost:8000/api/batches/${batchId}`);
      if (response.data.error) {
        setError(response.data.error);
      } else {
        setBatch(response.data);
      }
    } catch (err) {
      setError('Napaka pri nalaganju sklopa.');
    } finally {
      setLoading(false);
    }
  }

  async function downloadJSON() {
    try {
      const response = await axios.get(
        `http://localhost:8000/api/batches/${batchId}/export`
      );
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batch.name.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Napaka pri JSON export.');
    }
  }

  function downloadExcel() {
    // Direktni download — backend vrne file
    window.open(`http://localhost:8000/api/batches/${batchId}/export-excel`, '_blank');
  }

  function downloadTxt() {
    window.open(`http://localhost:8000/api/batches/${batchId}/export-txt`, '_blank');
  }

  function getConfidenceColor(conf) {
    if (conf === null || conf === undefined) return '#5a6070';
    if (conf >= 0.85) return '#22c55e';
    if (conf >= 0.6) return '#f59e0b';
    return '#ef4444';
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>Nalagam...</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!batch) return null;

  // Zberi vse unique field keys iz vseh dokumentov
  const allKeys = new Set();
  batch.documents.forEach(doc => {
    Object.keys(doc.fields || {}).forEach(k => allKeys.add(k));
  });
  const sortedKeys = Array.from(allKeys).sort();

  return (
    <div className="batch-results-page">

      <div className="batch-results-header">
        <button className="btn-secondary btn-sm" onClick={onBack}>
          ← Nazaj na seznam
        </button>

        <div className="batch-results-info">
          <div className="batch-results-title">{batch.name}</div>
          <div className="batch-results-meta">
            <span>Predloga: <strong>{batch.template_name || '—'}</strong></span>
            <span>{batch.total_documents} dokumentov</span>
            <span>{batch.completed_documents} obdelanih</span>
          </div>
        </div>

        <div className="batch-results-actions">
          <div className="view-toggle" style={{ marginRight: '8px' }}>
            <button
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Tabelni pogled"
            >
              Tabela
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Kartični pogled"
            >
              Kartice
            </button>
          </div>
          <button className="btn-secondary" onClick={downloadTxt}>
            TXT
          </button>
          <button className="btn-secondary" onClick={downloadJSON}>
            JSON
          </button>
          <button className="btn-primary" onClick={downloadExcel}>
            Excel
          </button>
        </div>
      </div>

      {batch.documents.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#5a6070' }}>
          Sklop nima dokumentov.
        </div>
      ) : viewMode === 'grid' ? (
        <div className="archive-grid">
          {batch.documents.map(doc => {
            const conf = doc.avg_confidence;
            let confClass = 'conf-medium';
            if (conf === null || conf === undefined) confClass = 'conf-medium';
            else if (conf >= 0.85) confClass = 'conf-high';
            else if (conf < 0.6) confClass = 'conf-low';

            const fieldCount = Object.keys(doc.fields || {}).length;

            return (
              <div
                key={doc.id}
                className={`archive-card ${confClass}`}
                onClick={() => handleOpenDocument(doc.id)}
              >
                <div className="archive-card-conf">
                  {conf !== null && conf !== undefined ? `${Math.round(conf * 100)}%` : '—'}
                </div>
                <div className="archive-card-filename">{doc.filename}</div>
                <div className="archive-card-meta">
                  <span>{fieldCount} polj</span>
                  {doc.total_pages && <span> • {doc.total_pages} strani</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="batch-results-table-wrap">
          <table className="batch-results-table">
            <thead>
              <tr>
                <th className="sticky-col">Datoteka</th>
                <th>Strani</th>
                <th>Avg. zanesljivost</th>
                {sortedKeys.map(key => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.documents.map(doc => (
                <tr
                  key={doc.id}
                  onClick={() => handleOpenDocument(doc.id)}
                  style={{ cursor: 'pointer' }}
                  className="history-row"
                >
                  <td className="sticky-col batch-results-filename">{doc.filename}</td>
                  <td>{doc.total_pages || '—'}</td>
                  <td>
                    {doc.avg_confidence !== null ? (
                      <span style={{ color: getConfidenceColor(doc.avg_confidence) }}>
                        {Math.round(doc.avg_confidence * 100)}%
                      </span>
                    ) : '—'}
                  </td>
                  {sortedKeys.map(key => {
                    const field = doc.fields[key];
                    return (
                      <td key={key} className="batch-results-cell">
                        {field ? (
                          <div>
                            <div>{field.value || <span style={{ color: '#5a6070' }}>—</span>}</div>
                            <div className="batch-results-conf" style={{ color: getConfidenceColor(field.confidence) }}>
                              {Math.round(field.confidence * 100)}%
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default BatchResultsPage;