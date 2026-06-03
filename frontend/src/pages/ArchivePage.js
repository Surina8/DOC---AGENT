import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ArchivePage({ onOpenDocument }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [openExportMenu, setOpenExportMenu] = useState(null); // doc id ali 'bulk'
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

  useEffect(() => {
    loadArchive();
  }, []);

  async function loadArchive() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:8000/api/archive');
      setDocuments(response.data.documents || []);
    } catch (err) {
      setError('Napaka pri nalaganju arhiva.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenDocument(id) {
    try {
      const response = await axios.get(`http://localhost:8000/api/documents/${id}`);
      if (response.data.error) {
        alert(response.data.error);
        return;
      }
      onOpenDocument(response.data);
    } catch (err) {
      alert('Napaka pri odpiranju dokumenta.');
    }
  }

  async function handleDelete(id, filename, e) {
    e.stopPropagation();
    if (!window.confirm(`Res želiš izbrisati "${filename}"?`)) return;

    try {
      await axios.delete(`http://localhost:8000/api/documents/${id}`);
      loadArchive();
    } catch (err) {
      alert('Napaka pri brisanju.');
    }
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  }

  function toggleSelectAll() {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map(d => d.id)));
    }
  }

  async function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  async function handleSingleExport(docId, filename, format, e) {
    e.stopPropagation();
    setOpenExportMenu(null);
    setExporting(true);
    try {
      const response = await axios.get(
        `http://localhost:8000/api/documents/${docId}/export?format=${format}`,
        { responseType: 'blob' }
      );
      const ext = format === 'excel' ? 'xlsx' : format;
      await downloadBlob(response.data, `${filename}.${ext}`);
    } catch (err) {
      alert('Napaka pri izvozu.');
    } finally {
      setExporting(false);
    }
  }

  async function handleBulkExport(format, e) {
    e.stopPropagation();
    setOpenExportMenu(null);
    if (selected.size === 0) {
      alert('Najprej izberi vsaj en dokument.');
      return;
    }
    setExporting(true);
    try {
      const response = await axios.post(
        'http://localhost:8000/api/archive/export',
        { document_ids: Array.from(selected), format },
        { responseType: 'blob' }
      );
      const ext = format === 'excel' ? 'xlsx' : format;
      await downloadBlob(response.data, `arhiv_export.${ext}`);
    } catch (err) {
      alert('Napaka pri bulk izvozu.');
    } finally {
      setExporting(false);
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString('sl-SI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getConfidenceColor(conf) {
    if (conf === null || conf === undefined) return '#5a6070';
    if (conf >= 0.85) return '#22c55e';
    if (conf >= 0.6) return '#f59e0b';
    return '#ef4444';
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>Nalagam arhiv...</div>;
  }

  if (error) return <div className="error-box">{error}</div>;

  if (documents.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#5a6070' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🗂️</div>
        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#9aa0b0' }}>
          Arhiv je prazen
        </div>
        <div style={{ fontSize: '13px' }}>
          Ko potrdiš katerikoli dokument v Human Review, se bo prikazal tukaj.
        </div>
      </div>
    );
  }

  return (
    <div className="archive-page" onClick={() => setOpenExportMenu(null)}>

      {/* Top bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div className="section-title">
          Arhiv potrjenih dokumentov ({documents.length})
          {selected.size > 0 && viewMode === 'table' && (
            <span style={{ marginLeft: '12px', fontSize: '13px', color: '#3b82f6' }}>
              ({selected.size} izbranih)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* View mode toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Tabelni pogled"
            >
              ☰ Tabela
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Kartični pogled"
            >
              ▦ Kartice
            </button>
          </div>

          {/* Bulk export — samo v tabelnem pogledu */}
          {viewMode === 'table' && (
        <div style={{ position: 'relative' }}>
          <button
            className="btn-primary"
            disabled={selected.size === 0 || exporting}
            onClick={(e) => {
              e.stopPropagation();
              setOpenExportMenu(openExportMenu === 'bulk' ? null : 'bulk');
            }}
          >
            ⬇ Izvozi izbrane ({selected.size}) ▾
          </button>
          {openExportMenu === 'bulk' && (
            <div className="export-menu">
              <div className="export-menu-item" onClick={(e) => handleBulkExport('excel', e)}>
                📊 Excel (.xlsx)
              </div>
              <div className="export-menu-item" onClick={(e) => handleBulkExport('json', e)}>
                📄 JSON
              </div>
              <div className="export-menu-item" onClick={(e) => handleBulkExport('csv', e)}>
                📋 CSV
              </div>
            </div>
          )}
        </div>
          )}
        </div>
      </div>

      {/* TABELA VIEW */}
      {viewMode === 'table' && (
      <table className="history-table">
        <thead>
          <tr>
            <th style={{ width: '40px' }}>
              <input
                type="checkbox"
                checked={selected.size === documents.length && documents.length > 0}
                onChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
            </th>
            <th>Datoteka</th>
            <th>Potrjen</th>
            <th>Polja</th>
            <th>Popravkov</th>
            <th>Zanesljivost</th>
            <th>Akcije</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => (
            <tr
              key={doc.id}
              className="history-row"
              onClick={() => handleOpenDocument(doc.id)}
            >
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={(e) => toggleSelect(doc.id, e)}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td className="history-filename">{doc.filename}</td>
              <td>{formatDate(doc.confirmed_at)}</td>
              <td>{doc.field_count}</td>
              <td>
                {doc.corrections_count > 0 ? (
                  <span style={{ color: '#f59e0b' }}>{doc.corrections_count}</span>
                ) : (
                  <span style={{ color: '#5a6070' }}>0</span>
                )}
              </td>
              <td>
                {doc.avg_confidence !== null ? (
                  <span style={{ color: getConfidenceColor(doc.avg_confidence), fontWeight: 'bold' }}>
                    {Math.round(doc.avg_confidence * 100)}%
                  </span>
                ) : '—'}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: '6px', position: 'relative' }}>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenExportMenu(openExportMenu === doc.id ? null : doc.id);
                    }}
                  >
                    ⬇ ▾
                  </button>
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => handleDelete(doc.id, doc.filename, e)}
                  >
                    🗑
                  </button>
                  {openExportMenu === doc.id && (
                    <div className="export-menu" style={{ right: 0, top: '32px' }}>
                      <div className="export-menu-item" onClick={(e) => handleSingleExport(doc.id, doc.filename, 'excel', e)}>
                        📊 Excel
                      </div>
                      <div className="export-menu-item" onClick={(e) => handleSingleExport(doc.id, doc.filename, 'json', e)}>
                        📄 JSON
                      </div>
                      <div className="export-menu-item" onClick={(e) => handleSingleExport(doc.id, doc.filename, 'csv', e)}>
                        📋 CSV
                      </div>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      {/* GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="archive-grid">
          {documents.map(doc => {
            const conf = doc.avg_confidence;
            let confClass = 'conf-medium';
            if (conf >= 0.85) confClass = 'conf-high';
            else if (conf < 0.6) confClass = 'conf-low';

            return (
              <div
                key={doc.id}
                className={`archive-card ${confClass}`}
                onClick={() => handleOpenDocument(doc.id)}
              >
                <div className="archive-card-conf">
                  {conf !== null ? `${Math.round(conf * 100)}%` : '—'}
                </div>
                <div className="archive-card-filename">{doc.filename}</div>
                <div className="archive-card-meta">
                  <span>{doc.field_count} polj</span>
                  {doc.corrections_count > 0 && (
                    <span> • {doc.corrections_count} popravkov</span>
                  )}
                </div>
                <div className="archive-card-date">
                  {formatDate(doc.confirmed_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {exporting && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#1a1d24',
          padding: '12px 20px',
          borderRadius: '8px',
          color: '#3b82f6',
          border: '1px solid #2a2f3a',
          zIndex: 100
        }}>
          Izvažam...
        </div>
      )}
    </div>
  );
}

export default ArchivePage;
