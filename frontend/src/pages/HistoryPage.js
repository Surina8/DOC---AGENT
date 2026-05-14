import React, { useEffect, useState } from 'react';
import axios from 'axios';

function HistoryPage({ onOpenDocument }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:8000/api/documents');
      setDocuments(response.data.documents || []);
    } catch (err) {
      setError('Napaka pri nalaganju dokumentov.');
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
      loadDocuments();
    } catch (err) {
      alert('Napaka pri brisanju.');
    }
  }

  function formatDate(isoString) {
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

  function getStatusBadge(status) {
    const styles = {
      pending: { bg: '#1e2d4a', color: '#3b82f6', label: 'Čaka pregled' },
      reviewed: { bg: '#0a2e1e', color: '#22c55e', label: 'Potrjeno' },
      rejected: { bg: '#2e0a0a', color: '#ef4444', label: 'Zavrnjeno' },
    };
    const s = styles[status] || styles.pending;
    return (
      <span
        className="status-badge"
        style={{ background: s.bg, color: s.color, borderColor: s.color }}
      >
        {s.label}
      </span>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>
        Nalagam dokumente...
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box">{error}</div>
    );
  }

  if (documents.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#5a6070' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📄</div>
        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#9aa0b0' }}>
          Še nimaš nobenega procesiranega dokumenta
        </div>
        <div style={{ fontSize: '13px' }}>
          Pojdi na "Nov dokument" in naloži prvi PDF.
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="section-title" style={{ marginBottom: '16px' }}>
        Vsi procesirani dokumenti ({documents.length})
      </div>

      <table className="history-table">
        <thead>
          <tr>
            <th>Datoteka</th>
            <th>Naloženo</th>
            <th>Strani</th>
            <th>Polja</th>
            <th>Zanesljivost</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              className="history-row"
              onClick={() => handleOpenDocument(doc.id)}
            >
              <td className="history-filename">{doc.filename}</td>
              <td>{formatDate(doc.upload_date)}</td>
              <td>{doc.total_pages || '—'}</td>
              <td>{doc.field_count}</td>
              <td>
                {doc.avg_confidence !== null ? (
                  <span style={{ color: getConfidenceColor(doc.avg_confidence) }}>
                    {Math.round(doc.avg_confidence * 100)}%
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>{getStatusBadge(doc.status)}</td>
              <td>
                <button
                  className="btn-danger btn-sm"
                  onClick={(e) => handleDelete(doc.id, doc.filename, e)}
                >
                  Izbriši
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HistoryPage;