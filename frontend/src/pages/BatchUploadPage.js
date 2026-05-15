import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function BatchUploadPage({ onViewResults }) {
  const [files, setFiles] = useState([]);
  const [batchName, setBatchName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Polja
  const [fields, setFields] = useState([]);
  const [suggesting, setSuggesting] = useState(false);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);
  const [error, setError] = useState(null);

  const pollingRef = useRef(null);

  useEffect(() => {
    loadTemplates();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  async function loadTemplates() {
    try {
      const response = await axios.get('http://localhost:8000/api/templates');
      setTemplates(response.data.templates || []);
    } catch (err) {
      console.error('Napaka pri nalaganju predlog:', err);
    }
  }

  async function handleTemplateSelect(templateId) {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setFields([]);
      return;
    }
    try {
      const response = await axios.get(`http://localhost:8000/api/templates/${templateId}`);
      if (response.data.error) {
        alert(response.data.error);
        return;
      }
      setFields(response.data.fields || []);
      setError(null);
    } catch (err) {
      setError('Napaka pri nalaganju predloge.');
    }
  }

  async function suggestFieldsFromFirst() {
    if (files.length === 0) {
      setError('Najprej naloži vsaj en PDF.');
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', files[0]);
      const response = await axios.post(
        'http://localhost:8000/api/suggest-fields',
        formData
      );
      if (response.data.fields) {
        setFields(response.data.fields);
        setSelectedTemplateId('');
      }
    } catch (err) {
      setError('Napaka pri predlaganju polj.');
    } finally {
      setSuggesting(false);
    }
  }

  function addField() {
    setFields([...fields, { key: '', description: '' }]);
  }

  function removeField(index) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function updateField(index, prop, value) {
    const updated = [...fields];
    updated[index][prop] = value;
    setFields(updated);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf'
    );
    if (dropped.length > 0) {
      setFiles([...files, ...dropped]);
      setError(null);
    }
  }

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files).filter(
      f => f.type === 'application/pdf'
    );
    if (selected.length > 0) {
      setFiles([...files, ...selected]);
      setError(null);
    }
  }

  function removeFile(index) {
    setFiles(files.filter((_, i) => i !== index));
  }

  function clearAll() {
    setFiles([]);
    setBatchName('');
    setSelectedTemplateId('');
    setFields([]);
  }

  async function createBatch() {
    if (files.length === 0) {
      setError('Naloži vsaj en PDF.');
      return;
    }
    if (!batchName.trim()) {
      setError('Vnesi ime batch-a.');
      return;
    }
    if (fields.length === 0) {
      setError('Definiraj vsaj eno polje za ekstrakcijo.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      formData.append('name', batchName.trim());
      formData.append('fields', JSON.stringify(fields));
      if (selectedTemplateId) {
        formData.append('template_id', selectedTemplateId);
      }

      const response = await axios.post(
        'http://localhost:8000/api/batches',
        formData
      );

      const batchId = response.data.batch_id;
      setActiveBatchId(batchId);
      startPolling(batchId);
    } catch (err) {
      setError('Napaka pri ustvarjanju batch-a.');
      setCreating(false);
    }
  }

  function startPolling(batchId) {
    pollBatch(batchId);
    pollingRef.current = setInterval(() => {
      pollBatch(batchId);
    }, 2000);
  }

  async function pollBatch(batchId) {
    try {
      const response = await axios.get(`http://localhost:8000/api/batches/${batchId}`);
      setBatchStatus(response.data);

      if (response.data.status === 'completed' || response.data.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setCreating(false);
      }
    } catch (err) {
      console.error('Napaka pri polling-u:', err);
    }
  }

  function startNewBatch() {
    setActiveBatchId(null);
    setBatchStatus(null);
    clearAll();
    setCreating(false);
  }

  function formatBytes(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ───────────────────────────────────────────────
  // Render: če je aktivni batch, pokaži progress
  // ───────────────────────────────────────────────
  if (activeBatchId && batchStatus) {
    const progress = batchStatus.total_documents > 0
      ? (batchStatus.completed_documents / batchStatus.total_documents) * 100
      : 0;
    const isCompleted = batchStatus.status === 'completed';
    const isFailed = batchStatus.status === 'failed';

    return (
      <div className="batch-upload-page">
        <div className="batch-progress-card">
          <div className="batch-progress-header">
            <div>
              <div className="batch-progress-title">{batchStatus.name}</div>
              <div className="batch-progress-sub">
                Template: <strong>{batchStatus.template_name || 'Brez (samodejno definirana polja)'}</strong>
              </div>
            </div>
            <div className={`batch-status-badge ${batchStatus.status}`}>
              {batchStatus.status === 'processing' && '⏳ Procesiranje'}
              {batchStatus.status === 'completed' && '✓ Končano'}
              {batchStatus.status === 'failed' && '✗ Napaka'}
            </div>
          </div>

          <div className="batch-progress-bar-wrap">
            <div className="batch-progress-bar">
              <div
                className="batch-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="batch-progress-text">
              {batchStatus.completed_documents} / {batchStatus.total_documents} dokumentov
              {' • '}
              {Math.round(progress)}%
            </div>
          </div>

          {batchStatus.documents && batchStatus.documents.length > 0 && (
            <div className="batch-docs-preview">
              <div className="batch-docs-preview-title">Dokumenti:</div>
              {batchStatus.documents.map((doc) => (
                <div key={doc.id} className="batch-doc-row">
                  <span className="batch-doc-name">{doc.filename}</span>
                  <span className="batch-doc-status">
                    {doc.has_extraction ? (
                      <span style={{ color: '#22c55e' }}>
                        ✓ {doc.avg_confidence !== null
                          ? `${Math.round(doc.avg_confidence * 100)}%`
                          : 'OK'}
                      </span>
                    ) : (
                      <span style={{ color: '#5a6070' }}>⏳ Čaka...</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(isCompleted || isFailed) && (
            <div className="batch-actions">
              <button
                className="btn-primary"
                onClick={() => onViewResults(activeBatchId)}
              >
                Poglej rezultate →
              </button>
              <button className="btn-secondary" onClick={startNewBatch}>
                Nov batch
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────
  // Render: glavni upload UI
  // ───────────────────────────────────────────────
  return (
    <div className="batch-upload-page">

      <div className="batch-config">
        <label className="batch-label">Ime batch-a *</label>
        <input
          type="text"
          className="batch-input"
          placeholder="npr. Pogodbe Q1 2026"
          value={batchName}
          onChange={(e) => setBatchName(e.target.value)}
        />
      </div>

      <div
        className={`upload-zone ${dragOver ? 'drag' : ''} ${files.length > 0 ? 'uploaded' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {files.length > 0 ? (
          <>
            <div className="upload-icon" style={{ color: '#22c55e' }}>📚</div>
            <div className="upload-title" style={{ color: '#22c55e' }}>
              {files.length} datotek pripravljenih
            </div>
            <div className="upload-sub">
              Skupna velikost: {formatBytes(files.reduce((sum, f) => sum + f.size, 0))}
            </div>
            <label className="btn-secondary" style={{ cursor: 'pointer' }}>
              + Dodaj več PDF-jev
              <input
                type="file"
                accept=".pdf"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </label>
          </>
        ) : (
          <>
            <div className="upload-icon">📚</div>
            <div className="upload-title">Povleci več PDF-jev sem</div>
            <div className="upload-sub">Ali klikni za izbor (lahko izberi več hkrati)</div>
            <label className="btn-primary" style={{ cursor: 'pointer' }}>
              Izberi datoteke
              <input
                type="file"
                accept=".pdf"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </label>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="batch-files-list">
          <div className="batch-files-header">
            Izbrane datoteke ({files.length})
            <button className="btn-danger btn-sm" onClick={clearAll}>
              Počisti vse
            </button>
          </div>
          {files.map((f, i) => (
            <div key={i} className="batch-file-item">
              <span className="batch-file-name">📄 {f.name}</span>
              <span className="batch-file-size">{formatBytes(f.size)}</span>
              <button className="btn-danger btn-sm" onClick={() => removeFile(i)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Template selector */}
      {files.length > 0 && templates.length > 0 && (
        <div className="template-selector">
          <label className="template-label">
            Naloži obstoječo predlogo polj:
          </label>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="template-select"
          >
            <option value="">— Brez predloge —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.field_count} polj • uporabljena {t.usage_count}×)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Polja */}
      {files.length > 0 && (
        <div className="fields-section">
          <div className="fields-header">
            <div className="section-title">Polja za ekstrakcijo</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={suggestFieldsFromFirst}
                disabled={suggesting}
              >
                {suggesting ? 'Analiziram...' : '✦ Predlagaj iz prvega PDF-ja'}
              </button>
              <button className="btn-primary" onClick={addField}>+ Dodaj polje</button>
            </div>
          </div>

          <div className="fields-table">
            <div className="fields-table-header">
              <span>Ključ</span>
              <span>Opis — kaj naj agent išče</span>
              <span></span>
            </div>
            {fields.length === 0 ? (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: '#5a6070',
                fontSize: '13px'
              }}>
                Izberi predlogo, predlagaj polja iz prvega PDF-ja, ali ročno dodaj polja
              </div>
            ) : (
              fields.map((field, i) => (
                <div className="field-row" key={i}>
                  <input
                    type="text"
                    value={field.key}
                    placeholder="npr. številka_pogodbe"
                    onChange={(e) => updateField(i, 'key', e.target.value)}
                  />
                  <input
                    type="text"
                    value={field.description}
                    placeholder="Opis polja"
                    onChange={(e) => updateField(i, 'description', e.target.value)}
                  />
                  <button className="btn-danger" onClick={() => removeField(i)}>
                    Odstrani
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="run-section">
        <button
          className="btn-run"
          disabled={files.length === 0 || !batchName.trim() || fields.length === 0 || creating}
          onClick={createBatch}
        >
          {creating ? 'Ustvarjam batch...' : `Procesiraj ${files.length || ''} dokumentov →`}
        </button>
      </div>

    </div>
  );
}

export default BatchUploadPage;