import { useState } from 'react';
import './styles.css';

const API_URL = 'http://localhost:3001';

function App() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedinData, setLinkedinData] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

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
    setStatus('🔄 Extracting LinkedIn data...\n\n✓ Navigating to profile\n⏳ Scrolling through page\n⏳ Expanding all sections\n⏳ Expanding ALL experiences (including hidden ones)\n⏳ Extracting data...\n\nThis takes 20-30 seconds, please wait...');
    try {
      const response = await fetch(`${API_URL}/api/scrape-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: 'https://www.linkedin.com/in/mocialov/' })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setLinkedinData(result.data);
        setStatus(`✅ Data extracted successfully!\n\n📊 Found:\n  • ${result.data.experience.length} experiences\n  • ${result.data.education.length} education entries\n  • ${result.data.skills.length} skills\n  • ${result.data.certifications.length} certifications`);
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
      certifications: filterCertificationViewerData(linkedinData.certifications)
    };
    
    console.log(`Filtered ${linkedinData.experience.length - filteredData.experience.length} viewer entries from experiences`);
    console.log(`Filtered ${linkedinData.certifications.length - filteredData.certifications.length} viewer entries from certifications`);
    console.log(`Final count: ${filteredData.experience.length} experiences, ${filteredData.certifications.length} certifications`);
    
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
        
        <div style={{marginTop: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, borderLeft: '4px solid #0891b2'}}>
          <strong>✨ What gets extracted:</strong>
          <ul style={{marginTop: 8, marginBottom: 0}}>
            <li>Profile info (name, headline, photo, about)</li>
            <li><strong>ALL experiences</strong> (including hidden ones + nested roles)</li>
            <li>Education, Skills, Certifications</li>
            <li>Projects, Volunteer work, Languages</li>
          </ul>
        </div>

        <p style={{marginTop: 12, fontSize: 14, color: '#6b7280'}}>
          💡 The extraction takes 20-30 seconds and automatically expands all sections
        </p>
      </div>

      <div className="button-group">
        {!browserOpen && (
          <button onClick={startBrowser} disabled={loading} className="button">
            {loading ? 'Starting...' : '🚀 Start Browser & Login'}
          </button>
        )}

        {browserOpen && !loggedIn && (
          <button onClick={checkLoginStatus} disabled={loading} className="button">
            {loading ? 'Checking...' : '🔍 Check If Logged In'}
          </button>
        )}

        {loggedIn && (
          <>
            <button onClick={extractData} disabled={loading} className="button" style={{background: '#10b981', fontSize: '18px', padding: '16px 32px'}}>
              {loading ? '⏳ Extracting Data... (20-30s)' : '📊 Extract All My Data'}
            </button>
            <button onClick={navigateToProfile} disabled={loading} className="button" style={{background: '#6b7280', fontSize: '14px'}}>
              {loading ? 'Navigating...' : '🧭 Go to Profile (optional)'}
            </button>
          </>
        )}

        {browserOpen && (
          <button onClick={closeBrowser} className="button" style={{background: '#ef4444'}}>
            ❌ Close Browser
          </button>
        )}
      </div>

      {status && (
        <div className={status.includes('❌') ? 'error' : 'result'} style={{marginTop: 20, whiteSpace: 'pre-line'}}>
          {status}
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
                  <div className="skills-grid" style={{marginTop: 12}}>
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

          <button onClick={downloadData} className="button" style={{marginTop: 16}}>
            💾 Download JSON
          </button>

          <details style={{marginTop: 16}}>
            <summary style={{cursor: 'pointer', marginBottom: 8}}>View Raw JSON</summary>
            <pre style={{fontSize: 12, overflow: 'auto'}}>{JSON.stringify(linkedinData, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default App;
