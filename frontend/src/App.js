import React, { useState } from 'react';
import './App.css';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import HistoryPage from './pages/HistoryPage';
import TemplatesPage from './pages/TemplatesPage';
import BatchUploadPage from './pages/BatchUploadPage';
import BatchListPage from './pages/BatchListPage';
import BatchResultsPage from './pages/BatchResultsPage';
import ArchivePage from './pages/ArchivePage';

// SVG ikone za sidebar
const ICONS = {
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  batch: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  archive: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  ),
  review: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15" y2="14" />
    </svg>
  ),
  folder: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  templates: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

function App() {
  const [activePage, setActivePage] = useState('upload');
  const [extractionResult, setExtractionResult] = useState(null);
  const [viewBatchId, setViewBatchId] = useState(null);
  const [previousPage, setPreviousPage] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  function toggleSidebar() {
    const newVal = !sidebarCollapsed;
    setSidebarCollapsed(newVal);
    localStorage.setItem('sidebarCollapsed', newVal);
  }

  const navSections = [
    {
      title: 'Nalaganje',
      items: [
        { page: 'upload', icon: ICONS.upload, label: 'Nov dokument' },
        { page: 'batch', icon: ICONS.batch, label: 'Batch upload' },
      ],
    },
    {
      title: 'Pregled',
      items: [
        { page: 'review', icon: ICONS.review, label: 'Human Review', showBadge: true },
        { page: 'history', icon: ICONS.history, label: 'Zgodovina' },
        { page: 'archive', icon: ICONS.folder, label: 'Arhiv' },
        { page: 'batch-list', icon: ICONS.archive, label: 'Batch arhiv', activeMatches: ['batch-list', 'batch-results'] },
      ],
    },
    {
      title: 'Sistem',
      items: [
        { page: 'templates', icon: ICONS.templates, label: 'Predloge' },
        { page: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
      ],
    },
  ];

  function goToReview(result) {
    setPreviousPage(activePage);   // zapomni od kod prišel
    setExtractionResult(result);
    setActivePage('review');
  }

  function openHistoricalDocument(documentData) {
    setPreviousPage(activePage);   // zapomni od kod prišel
    setExtractionResult(documentData);
    setActivePage('review');
  }

  function handleReviewComplete() {
    // Po potrjevanju dokumenta: počisti state in pojdi na upload
    setExtractionResult(null);
    setPreviousPage(null);
    setActivePage('upload');
  }

  function handleBackFromReview() {
    // Vrni se na tisto stran, kjer si bil prej
    const target = previousPage || 'upload';
    setPreviousPage(null);
    setActivePage(target);
  }

  function viewBatchResults(batchId) {
    setViewBatchId(batchId);
    setActivePage('batch-results');
  }

  function backToBatchList() {
    setViewBatchId(null);
    setActivePage('batch-list');
  }

  function getPageLabel(page) {
    const labels = {
      upload: 'Nov dokument',
      batch: 'Batch upload',
      'batch-list': 'Batch arhiv',
      'batch-results': 'Rezultati batch-a',
      history: 'Zgodovina',
      archive: 'Arhiv',
      templates: 'Predloge',
      dashboard: 'Dashboard',
    };
    return labels[page] || 'Nazaj';
  }

  return (
    <div className="app">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="logo">
          <div className="logo-mark">D</div>
          {!sidebarCollapsed && (
            <div className="logo-info">
              <div className="logo-text">DocAgent</div>
              <div className="logo-sub">IDP System</div>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Razširi' : 'Skrij'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />}
            </svg>
          </button>
        </div>
        <nav className="nav">
          {navSections.map(section => (
            <React.Fragment key={section.title}>
              {!sidebarCollapsed && (
                <div className="nav-section">{section.title}</div>
              )}
              {section.items.map(item => {
                const isActive = item.activeMatches
                  ? item.activeMatches.includes(activePage)
                  : activePage === item.page;
                return (
                  <div
                    key={item.page}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActivePage(item.page)}
                    title={sidebarCollapsed ? item.label : ''}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
                    {item.showBadge && extractionResult && (
                      <span className="nav-badge">1</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-item">DocAgent</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-item current">
              {activePage === 'upload' && 'Nov dokument'}
              {activePage === 'batch' && 'Batch upload'}
              {activePage === 'batch-list' && 'Batch arhiv'}
              {activePage === 'batch-results' && 'Rezultati batch-a'}
              {activePage === 'review' && 'Human Review'}
              {activePage === 'history' && 'Zgodovina dokumentov'}
              {activePage === 'archive' && 'Arhiv potrjenih'}
              {activePage === 'templates' && 'Predloge polj'}
              {activePage === 'dashboard' && 'Dashboard'}
            </span>
          </div>
        </div>
        <div className="content">
          {activePage === 'upload' && <UploadPage onComplete={goToReview} />}
          {activePage === 'batch' && <BatchUploadPage onViewResults={viewBatchResults} />}
          {activePage === 'batch-list' && <BatchListPage onOpenBatch={viewBatchResults} />}
          {activePage === 'batch-results' && (
            <BatchResultsPage
              batchId={viewBatchId}
              onBack={backToBatchList}
              onOpenDocument={openHistoricalDocument}
            />
          )}
          {activePage === 'review' && (
            <ReviewPage
              data={extractionResult}
              onConfirmed={handleReviewComplete}
              onBack={previousPage ? handleBackFromReview : null}
              previousPageLabel={getPageLabel(previousPage)}
            />
          )}
          {activePage === 'history' && <HistoryPage onOpenDocument={openHistoricalDocument} />}
          {activePage === 'archive' && <ArchivePage onOpenDocument={openHistoricalDocument} />}
          {activePage === 'templates' && <TemplatesPage />}
          {activePage === 'dashboard' && <p>Dashboard — kmalu</p>}
        </div>
      </div>
    </div>
  );
}

export default App;