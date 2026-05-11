import React, { useState } from 'react';
import axios from 'axios';

function UploadPage({ onComplete }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null); 

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setFields([]);
      setError(null);
    }
  }

  
  function handleFileSelect(e) {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setFields([]);
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
            <div className="upload-icon" style={{ color: '#22c55e' }}>✓</div>
            <div className="upload-title" style={{ color: '#22c55e' }}>{file.name}</div>
            <div className="upload-sub">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { setFile(null); setFields([]); }}>
                Zamenjaj datoteko
              </button>
              <button
                className="btn-primary"
                onClick={suggestFields}
                disabled={suggesting}
              >
                {suggesting ? 'Analiziram dokument...' : '✦ Predlagaj polja'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="upload-icon">↑</div>
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

      {/* Polja */}
      <div className="fields-section">
        <div className="fields-header">
          <div className="section-title">Polja za ekstrakcijo</div>
          <button className="btn-primary" onClick={addField}>+ Dodaj polje</button>
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
                ? 'Klikni "Predlagaj polja" da agent analizira dokument'
                : 'Najprej naloži PDF dokument'}
            </div>
          ) : (
            fields.map((field, i) => (
              <div className="field-row" key={i}>
                <input
                  type="text"
                  value={field.key}
                  placeholder="npr. vendor"
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

    </div>
  );
}

export default UploadPage; 