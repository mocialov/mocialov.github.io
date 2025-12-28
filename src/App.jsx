import { useState } from 'react';
import './styles.css';

const API_URL = 'http://localhost:3001';

function App() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedinData, setLinkedinData] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  // Filter out "Who viewed me" / "Who your viewers also viewed" data
  const filterViewerData = (experiences) => {
    if (!experiences) return [];
    return experiences.filter(exp => {
      const isViewerData =
        exp.title?.startsWith('Someone at') ||
        exp.company?.startsWith('Someone at') ||
        exp.title?.includes('…') ||
        exp.title?.includes('...') ||
        (exp.title?.match(/\bat\b/i) && !exp.company && !exp.dates && !exp.duration) ||
        ((!exp.dates && !exp.duration) && !exp.company && exp.title);
      return !isViewerData;
    });
  };

  // Filter out viewer data from certifications
  const filterCertificationViewerData = (certifications) => {
    if (!certifications) return [];
    return certifications.filter(cert => {
      // Filter out entries that look like "who viewed me" data
      const isViewerData =
        cert.name?.startsWith('Someone at') ||
        cert.issuer?.startsWith('Someone at') ||
        cert.name?.includes('Someone at') ||
        cert.name?.includes('…') ||
        cert.name?.includes('...') ||
        cert.name?.includes('Database Developer in the') ||
        // Filter out entries with "Title at Company" pattern without issuer/date
        (cert.name?.includes(' at ') && !cert.issuer && !cert.date) ||
        // Filter entries that don't have both name AND issuer (likely incomplete/viewer data)
        (!cert.name || !cert.issuer);
      return !isViewerData;
    });
  };

  // Filter out viewer data from projects
  const filterProjectsData = (projects) => {
    if (!projects) return [];
    return projects.filter(proj => {
      const isViewerData =
        proj.title?.startsWith('Someone at') ||
        proj.title?.includes('…') ||
        proj.title?.includes('...') ||
        (!proj.date && !proj.description);
      return !isViewerData;
    });
  };

  // Filter out viewer data from volunteering
  const filterVolunteeringData = (volunteering) => {
    if (!volunteering) return [];
    return volunteering.filter(vol => {
      const isViewerData =
        vol.role?.startsWith('Someone at') ||
        vol.organization?.startsWith('Someone at') ||
        (!vol.date && !vol.organization);
      return !isViewerData;
    });
  };

  // Filter out viewer data from publications
  const filterPublicationsData = (publications) => {
    if (!publications) return [];
    return publications.filter(pub => {
      const isViewerData =
        pub.title?.startsWith('Someone at') ||
        (!pub.date && !pub.publisher && !pub.url);
      return !isViewerData;
    });
  };

  // Filter out viewer data from honors
  const filterHonorsData = (honors) => {
    if (!honors) return [];
    return honors.filter(honor => {
      const isViewerData =
        honor.title?.startsWith('Someone at') ||
        (!honor.date && !honor.issuer);
      return !isViewerData;
    });
  };

  // Filter out viewer data from languages (usually clean, but for consistency)
  const filterLanguagesData = (languages) => {
    if (!languages) return [];
    return languages.filter(lang => {
      const isViewerData = lang?.includes('Someone at') || lang?.includes('…');
      return !isViewerData;
    });
  };

  const startBrowser = async () => {
    setLoading(true);
    setStatus('Opening browser...');
    try {
      const response = await fetch(`${API_URL}/api/start-browser`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setStatus('✅ Browser opened! Please login to LinkedIn in the browser window.');
        setBrowserOpen(true);
        // Start checking login status
        setTimeout(checkLoginStatus, 3000);
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const startBrowserHeadless = async () => {
    setLoading(true);
    setStatus('Starting browser in headless mode (using saved session)...');
    try {
      const response = await fetch(`${API_URL}/api/start-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: true })
      });
      const data = await response.json();
      if (data.success) {
        setBrowserOpen(true);
        setStatus('✅ Headless browser started! Checking login status...');
        // Check if already logged in
        setTimeout(checkLoginStatus, 2000);
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const switchToHeadless = async () => {
    setLoading(true);
    setStatus('Switching to headless mode...');
    try {
      const response = await fetch(`${API_URL}/api/switch-to-headless`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setStatus('✅ Switched to headless mode! Session preserved.');
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const fetchConsoleLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/console-logs?limit=200`);
      const data = await response.json();
      setConsoleLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching console logs:', error);
    }
  };

  const toggleLogs = () => {
    setShowLogs(!showLogs);
    if (!showLogs) {
      fetchConsoleLogs();
      // Auto-refresh logs every 2 seconds when visible
      const interval = setInterval(fetchConsoleLogs, 2000);
      return () => clearInterval(interval);
    }
  };

  const checkLoginStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/check-login`);
      const data = await response.json();
      if (data.loggedIn) {
        setLoggedIn(true);
        setStatus('✅ Logged in! Ready to extract data.');
      } else {
        setStatus('⏳ Waiting for login... Please login in the browser window.');
        // Check again in 3 seconds
        setTimeout(checkLoginStatus, 3000);
      }
    } catch (error) {
      console.error('Error checking login:', error);
    }
  };

  const navigateToProfile = async () => {
    setLoading(true);
    setStatus('Navigating to profile page...');
    try {
      const response = await fetch(`${API_URL}/api/navigate-to-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: 'https://www.linkedin.com/in/mocialov/' })
      });

      const result = await response.json();

      if (result.success) {
        setStatus('✅ Navigated to profile! Now you can extract data.');
      } else {
        setStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const extractData = async () => {
    setLoading(true);
    setStatus('🔄 Extracting LinkedIn data... (Attempting to find ALL 5+ projects)\n\n✓ Navigating to profile\n⏳ Scrolling through page\n⏳ Expanding all sections\n⏳ Populating Project Data (Method: Universal List Selector)\n⏳ Extracting data...\n\nThis takes 20-30 seconds, please wait...');
    try {
      const response = await fetch(`${API_URL}/api/scrape-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: 'https://www.linkedin.com/in/mocialov/' })
      });

      const result = await response.json();

      if (result.success) {
        setLinkedinData(result.data);
        setStatus(`✅ Data extracted successfully!\n\n📊 Found:\n  • ${result.data.experience.length} experiences\n  • ${result.data.education.length} education entries\n  • ${result.data.projects?.length || 0} projects\n  • ${result.data.volunteer?.length || 0} volunteering\n  • ${result.data.publications?.length || 0} publications\n  • ${result.data.honors?.length || 0} honors\n  • ${result.data.languages?.length || 0} languages\n  • ${result.data.skills.length} skills\n  • ${result.data.certifications.length} certifications`);
      } else {
        setStatus(`❌ Error: ${result.error || 'Failed to extract data'}`);
        if (result.error && result.error.includes('Not logged in')) {
          setLoggedIn(false);
        }
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}. Try navigating to profile first.`);
    }
    setLoading(false);
  };

  const closeBrowser = async () => {
    try {
      await fetch(`${API_URL}/api/close-browser`, { method: 'POST' });
      setBrowserOpen(false);
      setLoggedIn(false);
      setStatus('Browser closed.');
    } catch (error) {
      setStatus(`Error closing browser: ${error.message}`);
    }
  };

  const downloadData = () => {
    // Filter out viewer data before downloading
    const filteredData = {
      ...linkedinData,
      experience: filterViewerData(linkedinData.experience),
      projects: filterProjectsData(linkedinData.projects),
      certifications: filterCertificationViewerData(linkedinData.certifications),
      volunteer: filterVolunteeringData(linkedinData.volunteer),
      publications: filterPublicationsData(linkedinData.publications),
      honors: filterHonorsData(linkedinData.honors),
      languages: filterLanguagesData(linkedinData.languages)
    };

    console.log(`Filtered ${linkedinData.experience.length - filteredData.experience.length} viewer entries from experiences`);
    console.log(`Filtered ${(linkedinData.projects?.length || 0) - (filteredData.projects?.length || 0)} viewer entries from projects`);
    console.log(`Filtered ${linkedinData.certifications.length - filteredData.certifications.length} viewer entries from certifications`);
    console.log(`Filtered ${(linkedinData.volunteer?.length || 0) - (filteredData.volunteer?.length || 0)} viewer entries from volunteering`);
    console.log(`Filtered ${(linkedinData.publications?.length || 0) - (filteredData.publications?.length || 0)} viewer entries from publications`);
    console.log(`Filtered ${(linkedinData.honors?.length || 0) - (filteredData.honors?.length || 0)} viewer entries from honors`);
    console.log(`Final count: ${filteredData.experience.length} experiences, ${filteredData.projects?.length || 0} projects, ${filteredData.volunteer?.length || 0} volunteering, ${filteredData.publications?.length || 0} publications, ${filteredData.honors?.length || 0} honors, ${filteredData.certifications.length} certifications`);

    const dataStr = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkedin-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <h1 className="title">🔗 LinkedIn Profile Extractor</h1>
      <p className="subtitle">Extract ALL your LinkedIn profile data - including all past workplaces</p>

      <div className="instructions">
        <h3>📋 Simple 3-Step Process:</h3>
        <ol>
          <li><strong>Start Browser</strong> - Opens LinkedIn automatically</li>
          <li><strong>Log In</strong> - Sign into LinkedIn in the browser window (you'll see it open)</li>
          <li><strong>Extract Data</strong> - Automatically scrapes everything, including ALL experiences</li>
        </ol>

        <div style={{ marginTop: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, borderLeft: '4px solid #0891b2' }}>
          <strong>✨ What gets extracted:</strong>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li>Profile info (name, headline, photo, about)</li>
            <li><strong>ALL experiences</strong> (including hidden ones + nested roles)</li>
            <li>Education, Skills, Certifications</li>
            <li>Projects, <strong>Volunteering</strong>, Languages</li>
            <li><strong>Publications, Honors & Awards</strong></li>
          </ul>
        </div>

        <p style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
          💡 The extraction takes 20-30 seconds and automatically expands all sections
        </p>
      </div>

      <div className="button-group">
        {!browserOpen && (
          <>
            <button onClick={startBrowser} disabled={loading} className="button">
              {loading ? 'Starting...' : '🚀 Start Browser & Login'}
            </button>
            <button
              onClick={startBrowserHeadless}
              disabled={loading}
              className="button"
              style={{ background: '#8b5cf6' }}
              title="Use this if you're already logged in - runs in background"
            >
              {loading ? 'Starting...' : '👻 Start Headless (Already Logged In)'}
            </button>
          </>
        )}

        {browserOpen && !loggedIn && (
          <button onClick={checkLoginStatus} disabled={loading} className="button">
            {loading ? 'Checking...' : '🔍 Check If Logged In'}
          </button>
        )}

        {loggedIn && (
          <>
            <button onClick={extractData} disabled={loading} className="button" style={{ background: '#10b981', fontSize: '18px', padding: '16px 32px' }}>
              {loading ? '⏳ Extracting Data... (20-30s)' : '📊 Extract All My Data'}
            </button>
            <button onClick={switchToHeadless} disabled={loading} className="button" style={{ background: '#8b5cf6', fontSize: '14px' }}>
              {loading ? 'Switching...' : '👻 Switch to Headless Mode'}
            </button>
            <button onClick={navigateToProfile} disabled={loading} className="button" style={{ background: '#6b7280', fontSize: '14px' }}>
              {loading ? 'Navigating...' : '🧭 Go to Profile (optional)'}
            </button>
          </>
        )}

        {browserOpen && (
          <button onClick={closeBrowser} className="button" style={{ background: '#ef4444' }}>
            ❌ Close Browser
          </button>
        )}
      </div>

      {status && (
        <div className={status.includes('❌') ? 'error' : 'result'} style={{ marginTop: 20, whiteSpace: 'pre-line' }}>
          {status}
        </div>
      )}

      {browserOpen && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={toggleLogs}
            className="button"
            style={{ background: '#6366f1', fontSize: '14px' }}
          >
            {showLogs ? '🔽 Hide Browser Console' : '🔼 Show Browser Console'}
          </button>

          {showLogs && (
            <div style={{
              marginTop: 12,
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: '12px',
              borderRadius: '8px',
              maxHeight: '400px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              <div style={{ marginBottom: 8, color: '#9ca3af', fontSize: 11 }}>
                Browser Console Output ({consoleLogs.length} messages)
              </div>
              {consoleLogs.length === 0 ? (
                <div style={{ color: '#9ca3af' }}>No console output yet...</div>
              ) : (
                consoleLogs.map((log, i) => (
                  <div key={i} style={{
                    padding: '4px 0',
                    borderBottom: '1px solid #333',
                    color: log.type === 'error' ? '#f87171' :
                      log.type === 'warn' ? '#fbbf24' :
                        log.type === 'info' ? '#60a5fa' : '#d4d4d4'
                  }}>
                    <span style={{ color: '#9ca3af', marginRight: 8 }}>
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span style={{ color: '#a78bfa', marginRight: 8 }}>
                      {log.type.toUpperCase()}
                    </span>
                    {log.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {linkedinData && (
        <div className="result">
          {/* SECTION 1: HEADER - Contact & Profile Summary */}
          <div className="profile-header">
            {linkedinData.image && (
              <img src={linkedinData.image} alt="Profile" className="profile-photo" />
            )}
            <div className="profile-info">
              <h1 className="profile-name">{linkedinData.name}</h1>
              <div className="profile-headline">{linkedinData.headline}</div>
              <div className="profile-location">📍 {linkedinData.location}</div>
            </div>
          </div>

          {/* Professional Summary */}
          {linkedinData.about && (
            <div className="section">
              <h2 className="section-title">Professional Summary</h2>
              <p className="about-text">{linkedinData.about}</p>
            </div>
          )}

          {/* SECTION 2: CORE SKILLS - Most Important for Recruiters */}
          {linkedinData.skills && linkedinData.skills.length > 0 && (
            <div className="section">
              <h2 className="section-title">🛠️ Core Skills & Expertise</h2>
              <div className="skills-grid">
                {linkedinData.skills.slice(0, 15).map((skill, i) => (
                  <span key={i} className="skill-badge skill-primary">{skill}</span>
                ))}
              </div>
              {linkedinData.skills.length > 15 && (
                <details className="skills-expand">
                  <summary className="skills-expand-btn">
                    View all {linkedinData.skills.length} skills
                  </summary>
                  <div className="skills-grid" style={{ marginTop: 12 }}>
                    {linkedinData.skills.slice(15).map((skill, i) => (
                      <span key={i} className="skill-badge">{skill}</span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* SECTION 3: PROFESSIONAL EXPERIENCE - Core Section */}
          {linkedinData.experience && linkedinData.experience.length > 0 && (
            <div className="section">
              <h2 className="section-title">💼 Professional Experience</h2>
              <div className="experience-count">
                {filterViewerData(linkedinData.experience).length} positions
              </div>
              <div className="timeline">
                {filterViewerData(linkedinData.experience).map((exp, i) => (
                  <div key={i} className="experience-item">
                    <div className="timeline-marker"></div>
                    <div className="experience-content">
                      <h3 className="experience-title">{exp.title}</h3>
                      <div className="experience-company">{exp.company}</div>
                      <div className="experience-meta">
                        <span className="experience-duration">{exp.duration}</span>
                        {exp.location && <span className="experience-location">• {exp.location}</span>}
                      </div>
                      {exp.description && (
                        <div className="experience-description">{exp.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: EDUCATION */}
          {linkedinData.education && linkedinData.education.length > 0 && (
            <div className="section">
              <h2 className="section-title">🎓 Education</h2>
              <div className="education-list">
                {linkedinData.education.map((edu, i) => (
                  <div key={i} className="education-item">
                    <h3 className="education-school">{edu.school}</h3>
                    <div className="education-degree">
                      {edu.degree} {edu.field && `• ${edu.field}`}
                    </div>
                    <div className="education-duration">{edu.duration}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 5: CERTIFICATIONS & CREDENTIALS */}
          {linkedinData.certifications && filterCertificationViewerData(linkedinData.certifications).length > 0 && (
            <div className="section">
              <h2 className="section-title">📜 Certifications & Credentials</h2>
              <div className="certifications-grid">
                {filterCertificationViewerData(linkedinData.certifications).map((cert, i) => (
                  <div key={i} className="certification-item">
                    <div className="certification-name">{cert.name}</div>
                    <div className="certification-issuer">{cert.issuer}</div>
                    <div className="certification-date">{cert.date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 6: PROJECTS */}
          {linkedinData.projects && filterProjectsData(linkedinData.projects).length > 0 && (
            <div className="section">
              <h2 className="section-title">🚀 Projects</h2>
              <div className="timeline">
                {filterProjectsData(linkedinData.projects).map((proj, i) => (
                  <div key={i} className="experience-item">
                    <div className="timeline-marker"></div>
                    <div className="experience-content">
                      <h3 className="experience-title">
                        {proj.url ? (
                          <a href={proj.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                            {proj.title} 🔗
                          </a>
                        ) : proj.title}
                      </h3>
                      <div className="experience-meta">
                        <span className="experience-duration">{proj.date}</span>
                      </div>
                      {proj.description && (
                        <div className="experience-description">{proj.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 7: VOLUNTEERING */}
          {linkedinData.volunteer && filterVolunteeringData(linkedinData.volunteer).length > 0 && (
            <div className="section">
              <h2 className="section-title">❤️ Volunteering</h2>
              <div className="timeline">
                {filterVolunteeringData(linkedinData.volunteer).map((vol, i) => (
                  <div key={i} className="experience-item">
                    <div className="timeline-marker"></div>
                    <div className="experience-content">
                      <h3 className="experience-title">{vol.role}</h3>
                      <div className="experience-company">{vol.organization}</div>
                      <div className="experience-meta">
                        <span className="experience-duration">{vol.date} {vol.duration && `• ${vol.duration}`}</span>
                        {vol.cause && <span className="experience-location">• {vol.cause}</span>}
                      </div>
                      {vol.description && (
                        <div className="experience-description">{vol.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 8: PUBLICATIONS */}
          {linkedinData.publications && filterPublicationsData(linkedinData.publications).length > 0 && (
            <div className="section">
              <h2 className="section-title">📚 Publications</h2>
              <div className="timeline">
                {filterPublicationsData(linkedinData.publications).map((pub, i) => (
                  <div key={i} className="experience-item">
                    <div className="timeline-marker"></div>
                    <div className="experience-content">
                      <h3 className="experience-title">
                        {pub.url ? (
                          <a href={pub.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                            {pub.title} 🔗
                          </a>
                        ) : pub.title}
                      </h3>
                      <div className="experience-company">{pub.publisher}</div>
                      <div className="experience-meta">
                        <span className="experience-duration">{pub.date}</span>
                      </div>
                      {pub.description && (
                        <div className="experience-description">{pub.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 9: HONORS & AWARDS */}
          {linkedinData.honors && filterHonorsData(linkedinData.honors).length > 0 && (
            <div className="section">
              <h2 className="section-title">🏆 Honors & Awards</h2>
              <div className="timeline">
                {filterHonorsData(linkedinData.honors).map((honor, i) => (
                  <div key={i} className="experience-item">
                    <div className="timeline-marker"></div>
                    <div className="experience-content">
                      <h3 className="experience-title">{honor.title}</h3>
                      <div className="experience-company">{honor.issuer}</div>
                      <div className="experience-meta">
                        <span className="experience-duration">{honor.date}</span>
                      </div>
                      {honor.description && (
                        <div className="experience-description">{honor.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 10: LANGUAGES */}
          {linkedinData.languages && filterLanguagesData(linkedinData.languages).length > 0 && (
            <div className="section">
              <h2 className="section-title">🌐 Languages</h2>
              <div className="skills-grid">
                {filterLanguagesData(linkedinData.languages).map((language, i) => (
                  <span key={i} className="skill-badge skill-primary">{language}</span>
                ))}
              </div>
            </div>
          )}

          <button onClick={downloadData} className="button" style={{ marginTop: 16 }}>
            💾 Download JSON
          </button>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8 }}>View Raw JSON</summary>
            <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(linkedinData, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default App;
