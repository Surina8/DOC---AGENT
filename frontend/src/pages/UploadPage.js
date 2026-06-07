import React, { useState, useEffect } from 'react';
import axios from 'axios';

function UploadPage({
  onComplete,
  file,
  setFile,
  fields,
  setFields,
  selectedTemplateId,
  setSelectedTemplateId,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateDocType, setTemplateDocType] = useState('contract');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Similar documents (RAG)
  const [similarDocs, setSimilarDocs] = useState([]);
  const [searchingSimilar, setSearchingSimilar] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  // Avtomatski search za podobne dokumente ko se naloži file
  useEffect(() => {
    if (file) {
      findSimilar();
    } else {
      setSimilarDocs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function loadTemplates() {
    try {
      const response = await axios.get('http://localhost:8000/api/templates');
      setTemplates(response.data.templates || []);
    } catch (err) {
      console.error('Napaka pri nalaganju predlog:', err);
    }
  }

  async function findSimilar() {
    if (!file) return;
    setSearchingSimilar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('limit', 5);
      const response = await axios.post(
        'http://localhost:8000/api/find-similar',
        formData
      );
      setSimilarDocs(response.data.similar_documents || []);
    } catch (err) {
      console.error('Napaka pri iskanju podobnih:', err);
    } finally {
      setSearchingSimilar(false);
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

  async function applyTemplateFromSimilar(templateId) {
    await handleTemplateSelect(templateId);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      alert('Vnesi ime predloge.');
      return;
    }
    if (fields.length === 0) {
      alert('Predloga mora imeti vsaj eno polje.');
      return;
    }

    setSavingTemplate(true);
    try {
      await axios.post('http://localhost:8000/api/templates', {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        document_type: templateDocType,
        fields: fields.map(f => ({
          field_key: f.key,
          field_description: f.description,
        })),
      });
      setTemplateName('');
      setTemplateDescription('');
      setShowSaveModal(false);
      loadTemplates();
      alert('Predloga shranjena!');
    } catch (err) {
      alert('Napaka pri shranjevanju predloge.');
    } finally {
      setSavingTemplate(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setError(null);
    }
  }

  function handleFileSelect(e) {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  }

  async function suggestFields() {
    if (!file) return;
    setSuggesting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(
        'http://localhost:8000/api/suggest-fields',
        formData
      );
      if (response.data.fields) {
        setFields(response.data.fields);
        setSelectedTemplateId('');
      }
    } catch (err) {
      setError('Napaka pri predlaganju polj. Poskusi znova.');
    } finally {
      setSuggesting(false);
    }
  }

  async function runAgent() {
    if (!file || fields.length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fields', JSON.stringify(fields));
      // Pošlji template_id če je predloga izbrana
      if (selectedTemplateId) {
        formData.append('template_id', selectedTemplateId);
      }
      const response = await axios.post(
        'http://localhost:8000/api/extract',
        formData
      );
      onComplete(response.data);
    } catch (err) {
      setError('Napaka pri ekstrakciji. Poskusi znova.');
    } finally {
      setProcessing(false);
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

  function getSimilarityColor(sim) {
    if (sim >= 0.85) return '#22c55e';
    if (sim >= 0.7) return '#f59e0b';
    return '#5a6070';
  }

  function getSimilarityLabel(sim) {
    if (sim >= 0.85) return 'Zelo podobno';
    if (sim >= 0.7) return 'Sorodno';
    return 'Različno';
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('sl-SI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return (
    <div className="upload-page">

      {/* Upload zona */}
      <div
        className={`upload-zone ${dragOver ? 'drag' : ''} ${file ? 'uploaded' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <>
            <div className="upload-title" style={{ color: '#22c55e' }}>{file.name}</div>
            <div className="upload-sub">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { setFile(null); }}>
                Zamenjaj datoteko
              </button>
              <button
                className="btn-primary"
                onClick={suggestFields}
                disabled={suggesting}
              >
                {suggesting ? 'Analiziram dokument...' : 'Predlagaj polja'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="upload-title">Povleci PDF sem ali klikni</div>
            <div className="upload-sub">Podprti formati: PDF — max 20MB</div>
            <label className="btn-primary" style={{ cursor: 'pointer' }}>
              Izberi datoteko
              <input
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </label>
          </>
        )}
      </div>

      {/* Napaka */}
      {error && (
        <div className="error-box">{error}</div>
      )}

      {/* Panel podobnih dokumentov (RAG) */}
      {file && (searchingSimilar || similarDocs.length > 0) && (
        <div className="similar-panel">
          <div className="similar-header">
            <span className="similar-title">
              {searchingSimilar
                ? 'Iščem podobne dokumente v bazi...'
                : `Najdeno ${similarDocs.length} podobnih dokumentov`}
            </span>
          </div>
          {!searchingSimilar && (
            <div className="similar-list">
              {similarDocs.map((doc) => (
                <div key={doc.id} className="similar-card">
                  <div className="similar-card-main">
                    <div className="similar-card-row">
                      <span className="similar-filename">{doc.filename}</span>
                      <span
                        className="similar-score"
                        style={{
                          color: getSimilarityColor(doc.similarity),
                          borderColor: getSimilarityColor(doc.similarity),
                        }}
                      >
                        {getSimilarityLabel(doc.similarity)} • {Math.round(doc.similarity * 100)}%
                      </span>
                    </div>
                    <div className="similar-meta">
                      <span>{formatDate(doc.upload_date)}</span>
                      {doc.template && (
                        <span>Uporabljen template: <strong>{doc.template.name}</strong></span>
                      )}
                    </div>
                  </div>
                  {doc.template && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => applyTemplateFromSimilar(doc.template.id)}
                    >
                      Uporabi ta template
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Template selector */}
      {file && templates.length > 0 && (
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
      <div className="fields-section">
        <div className="fields-header">
          <div className="section-title">Polja za ekstrakcijo</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {fields.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => setShowSaveModal(true)}
              >
                Shrani kot predlogo
              </button>
            )}
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
              {file
                ? 'Klikni "Predlagaj polja" ali izberi predlogo iz seznama zgoraj'
                : 'Najprej naloži PDF dokument'}
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

      {/* Zaženi */}
      <div className="run-section">
        <button
          className="btn-run"
          disabled={!file || fields.length === 0 || processing}
          onClick={runAgent}
        >
          {processing ? 'Procesiranje...' : 'Zaženi agenta →'}
        </button>
        <span className="model-info">Model: gpt-4o-mini via OpenRouter</span>
      </div>

      {/* Save template modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Shrani kot predlogo</div>
            <div className="modal-sub">
              Shranil boš {fields.length} polj kot ponovno uporabno predlogo.
            </div>

            <label className="modal-label">Ime predloge *</label>
            <input
              type="text"
              className="modal-input"
              placeholder="npr. Pogodba o sodelovanju"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
            />

            <label className="modal-label">Opis (neobvezno)</label>
            <input
              type="text"
              className="modal-input"
              placeholder="Kratek opis kdaj uporabiti to predlogo"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
            />

            <label className="modal-label">Tip dokumenta</label>
            <select
              className="modal-input"
              value={templateDocType}
              onChange={(e) => setTemplateDocType(e.target.value)}
            >
              <option value="contract">Pogodba</option>
              <option value="invoice">Račun</option>
              <option value="form">Obrazec</option>
              <option value="other">Drugo</option>
            </select>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowSaveModal(false)}
                disabled={savingTemplate}
              >
                Prekliči
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !templateName.trim()}
              >
                {savingTemplate ? 'Shranjujem...' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default UploadPage;