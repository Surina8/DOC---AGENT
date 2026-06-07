import React, { useEffect, useState } from 'react';
import axios from 'axios';

function BatchListPage({ onOpenBatch }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:8000/api/batches');
      setBatches(response.data.batches || []);
    } catch (err) {
      setError('Napaka pri nalaganju batch-ov.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, name, e) {
    e.stopPropagation();
    if (!window.confirm(`Res želiš izbrisati batch "${name}" in vse dokumente v njem?`)) return;

    try {
      await axios.delete(`http://localhost:8000/api/batches/${id}`);
      loadBatches();
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

  function getStatusBadge(status) {
    const styles = {
      processing: { bg: '#1e2d4a', color: '#3b82f6', label: 'Procesiranje' },
      completed: { bg: '#0a2e1e', color: '#22c55e', label: 'Končano' },
      failed: { bg: '#2e0a0a', color: '#ef4444', label: 'Napaka' },
    };
    const s = styles[status] || styles.processing;
    return (
      <span className="status-badge" style={{ background: s.bg, color: s.color, borderColor: s.color }}>
        {s.label}
      </span>
    );
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>Nalagam...</div>;
  }

  if (error) return <div className="error-box">{error}</div>;

  if (batches.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#5a6070' }}>
        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#9aa0b0' }}>
          Še nimaš nobenega batch-a
        </div>
        <div style={{ fontSize: '13px' }}>
          Pojdi na "Batch upload" in ustvari prvega.
        </div>
      </div>
    );
  }

  return (
    <div className="batches-list-page">
      <div className="section-title" style={{ marginBottom: '16px' }}>
        Vsi batch-i ({batches.length})
      </div>

      <table className="history-table">
        <thead>
          <tr>
            <th>Ime</th>
            <th>Predloga</th>
            <th>Ustvarjen</th>
            <th>Progress</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {batches.map(b => {
            const progress = b.total_documents > 0
              ? (b.completed_documents / b.total_documents) * 100
              : 0;
            return (
              <tr
                key={b.id}
                className="history-row"
                onClick={() => onOpenBatch(b.id)}
              >
                <td className="history-filename">{b.name}</td>
                <td>{b.template_name || '—'}</td>
                <td>{formatDate(b.created_date)}</td>
                <td>
                  <div className="batch-mini-progress">
                    <div className="batch-mini-bar">
                      <div className="batch-mini-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span>{b.completed_documents} / {b.total_documents}</span>
                  </div>
                </td>
                <td>{getStatusBadge(b.status)}</td>
                <td>
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => handleDelete(b.id, b.name, e)}
                  >
                    Izbriši
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default BatchListPage;