import React, { useEffect, useState } from 'react';
import axios from 'axios';

function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [templateDetails, setTemplateDetails] = useState({});

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:8000/api/templates');
      setTemplates(response.data.templates || []);
    } catch (err) {
      setError('Napaka pri nalaganju predlog.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(templateId) {
    if (expandedId === templateId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(templateId);

    if (!templateDetails[templateId]) {
      try {
        const response = await axios.get(`http://localhost:8000/api/templates/${templateId}`);
        if (!response.data.error) {
          setTemplateDetails({
            ...templateDetails,
            [templateId]: response.data,
          });
        }
      } catch (err) {
        console.error('Napaka pri nalaganju detajlov:', err);
      }
    }
  }

  async function handleDelete(id, name, e) {
    e.stopPropagation();
    if (!window.confirm(`Res želiš izbrisati predlogo "${name}"?`)) return;

    try {
      await axios.delete(`http://localhost:8000/api/templates/${id}`);
      loadTemplates();
      setExpandedId(null);
    } catch (err) {
      alert('Napaka pri brisanju predloge.');
    }
  }

  function getDocTypeLabel(type) {
    const labels = {
      contract: 'Pogodba',
      invoice: 'Račun',
      form: 'Obrazec',
      other: 'Drugo',
    };
    return labels[type] || type || '—';
  }

  function getDocTypeColor(type) {
    const colors = {
      contract: '#3b82f6',
      invoice: '#22c55e',
      form: '#f59e0b',
      other: '#9aa0b0',
    };
    return colors[type] || '#9aa0b0';
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('sl-SI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9aa0b0' }}>
        Nalagam predloge...
      </div>
    );
  }

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  if (templates.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#5a6070' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '16px', marginBottom: '8px', color: '#9aa0b0' }}>
          Še nimaš shranjenih predlog
        </div>
        <div style={{ fontSize: '13px' }}>
          Pojdi na "Nov dokument", konfiguriraj polja in klikni "💾 Shrani kot predlogo".
        </div>
      </div>
    );
  }

  return (
    <div className="templates-page">
      <div className="section-title" style={{ marginBottom: '16px' }}>
        Shranjene predloge ({templates.length})
      </div>

      <div className="templates-list">
        {templates.map((t) => {
          const isExpanded = expandedId === t.id;
          const details = templateDetails[t.id];
          const docColor = getDocTypeColor(t.document_type);

          return (
            <div
              key={t.id}
              className={`template-card ${isExpanded ? 'expanded' : ''}`}
              onClick={() => toggleExpand(t.id)}
            >
              <div className="template-card-header">
                <div className="template-card-main">
                  <div className="template-card-title">
                    <span
                      className="template-doc-badge"
                      style={{ background: `${docColor}20`, color: docColor, borderColor: docColor }}
                    >
                      {getDocTypeLabel(t.document_type)}
                    </span>
                    <span className="template-name">{t.name}</span>
                  </div>
                  {t.description && (
                    <div className="template-description">{t.description}</div>
                  )}
                  <div className="template-meta">
                    <span>📋 {t.field_count} polj</span>
                    <span>🔁 Uporabljena {t.usage_count}×</span>
                    <span>📅 {formatDate(t.created_date)}</span>
                  </div>
                </div>
                <div className="template-card-actions">
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => handleDelete(t.id, t.name, e)}
                  >
                    Izbriši
                  </button>
                  <span className="expand-arrow">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="template-card-body" onClick={(e) => e.stopPropagation()}>
                  <div className="template-fields-title">Polja v tej predlogi:</div>
                  {details ? (
                    <div className="template-fields-list">
                      {details.fields.map((f, i) => (
                        <div key={i} className="template-field-item">
                          <span className="template-field-key">{f.key}</span>
                          <span className="template-field-desc">{f.description}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#5a6070', fontSize: '13px' }}>
                      Nalagam polja...
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TemplatesPage;