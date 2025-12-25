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
      experience: filterViewerData(linkedinData.experience)
    };
    
    console.log(`Filtered ${linkedinData.experience.length - filteredData.experience.length} viewer entries`);
    console.log(`Final count: ${filteredData.experience.length} experiences`);
    
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
          <h2>📋 Extracted Data</h2>
          
          {linkedinData.image && (
            <img src={linkedinData.image} alt="Profile" style={{width: 150, height: 150, borderRadius: '50%', objectFit: 'cover', margin: '16px 0'}} />
          )}
          
          <div style={{marginBottom: 12}}>
            <strong>Name:</strong> {linkedinData.name}
          </div>
          <div style={{marginBottom: 12}}>
            <strong>Headline:</strong> {linkedinData.headline}
          </div>
          <div style={{marginBottom: 12}}>
            <strong>Location:</strong> {linkedinData.location}
          </div>
          
          {linkedinData.about && (
            <div style={{marginBottom: 16}}>
              <strong>About:</strong>
              <p style={{whiteSpace: 'pre-wrap', marginTop: 8, padding: 12, background: '#f9f9f9', borderRadius: 4}}>{linkedinData.about}</p>
            </div>
          )}

          <div style={{marginBottom: 16, padding: 12, background: '#f3f4f6', borderRadius: 4}}>
            <strong>Statistics:</strong>
            <ul style={{marginTop: 8}}>
              <li>Experience: {filterViewerData(linkedinData.experience).length} entries</li>
              <li>Education: {linkedinData.education?.length || 0} entries</li>
              <li>Skills: {linkedinData.skills?.length || 0} skills</li>
              <li>Certifications: {linkedinData.certifications?.length || 0} certs</li>
            </ul>
          </div>

          {linkedinData.experience && linkedinData.experience.length > 0 && (
            <div style={{marginBottom: 16}}>
              <strong>💼 Experience:</strong>
              {filterViewerData(linkedinData.experience).map((exp, i) => (
                <div key={i} style={{marginTop: 12, padding: 12, background: '#f9f9f9', borderRadius: 4}}>
                  <div style={{fontWeight: 600}}>{exp.title}</div>
                  <div style={{color: '#666'}}>{exp.company}</div>
                  <div style={{fontSize: 14, color: '#888'}}>{exp.duration} {exp.location && `• ${exp.location}`}</div>
                  {exp.description && <div style={{marginTop: 8, fontSize: 14}}>{exp.description}</div>}
                </div>
              ))}
            </div>
          )}
          
          {linkedinData.education && linkedinData.education.length > 0 && (
            <div style={{marginBottom: 16}}>
              <strong>🎓 Education:</strong>
              {linkedinData.education.map((edu, i) => (
                <div key={i} style={{marginTop: 12, padding: 12, background: '#f9f9f9', borderRadius: 4}}>
                  <div style={{fontWeight: 600}}>{edu.school}</div>
                  <div style={{color: '#666'}}>{edu.degree} {edu.field && `- ${edu.field}`}</div>
                  <div style={{fontSize: 14, color: '#888'}}>{edu.duration}</div>
                </div>
              ))}
            </div>
          )}
          
          {linkedinData.skills && linkedinData.skills.length > 0 && (
            <div style={{marginBottom: 16}}>
              <strong>🛠️ Skills:</strong>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8}}>
                {linkedinData.skills.map((skill, i) => (
                  <span key={i} style={{padding: '4px 12px', background: '#e0e7ff', borderRadius: 16, fontSize: 14}}>{skill}</span>
                ))}
              </div>
            </div>
          )}

          {linkedinData.certifications && linkedinData.certifications.length > 0 && (
            <div style={{marginBottom: 16}}>
              <strong>📜 Certifications:</strong>
              {linkedinData.certifications.map((cert, i) => (
                <div key={i} style={{marginTop: 8, padding: 8, background: '#f9f9f9', borderRadius: 4, fontSize: 14}}>
                  <div style={{fontWeight: 600}}>{cert.name}</div>
                  <div style={{color: '#666'}}>{cert.issuer}</div>
                  <div style={{color: '#888', fontSize: 12}}>{cert.date}</div>
                </div>
              ))}
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
