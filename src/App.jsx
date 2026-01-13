import { useEffect, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DOMPurify from 'dompurify';
import CV from './components/CV.jsx';
import CollapsibleSection from './components/CollapsibleSection.jsx';
import EditableText from './components/EditableText.jsx';
import './styles.css';
import { DEBUG } from './config.js';

const API_URL = 'http://localhost:3001';

function App() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedinData, setLinkedinData] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [excludedKeys, setExcludedKeys] = useState([]); // track removed items per section
  const [draftData, setDraftData] = useState(null); // editable copy
  const [profileUrl, setProfileUrl] = useState('');
  const [hiddenSections, setHiddenSections] = useState([]); // track removed sections
  const DEFAULT_SECTION_ORDER = ['summary','skills','experience','education','certifications','projects','volunteer','publications','honors','languages','patents'];
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);
  const [showReorderSections, setShowReorderSections] = useState(false);
  const [pdfFriendly, setPdfFriendly] = useState(false);

  useEffect(() => {
    const cls = 'pdf-friendly';
    const el = document.body;
    if (!el) return;
    if (pdfFriendly) el.classList.add(cls); else el.classList.remove(cls);
    return () => el.classList.remove(cls);
  }, [pdfFriendly]);

  const getItemId = (section, index) => `${section}:${index}`;
  
  // Helper: convert HTML or text to plain text
  const toPlainText = (htmlOrText) => {
    if (!htmlOrText) return '';
    const s = String(htmlOrText);
    if (/<\/?[a-z][\s\S]*>/i.test(s)) {
      const div = document.createElement('div');
      div.innerHTML = s;
      return (div.textContent || '').trim();
    }
    return s.trim();
  };
  
  // If content is duplicated back-to-back, keep only the first half
  const dedupeRepeatedText = (htmlOrText) => {
    const text = toPlainText(htmlOrText).replace(/\s+/g, ' ').trim();
    if (text.length >= 2 && text.length % 2 === 0) {
      const mid = text.length / 2;
      const first = text.slice(0, mid);
      const second = text.slice(mid);
      if (first === second) return first.trim();
    }
    return toPlainText(htmlOrText);
  };

  const SortableRow = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    return (
      <div ref={setNodeRef} className={`sortable-item${isDragging ? ' dragging' : ''}`} style={style}>
        <span className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}>⋮⋮</span>
        {children}
      </div>
    );
  };

  // Sanitize and format summary HTML while allowing basic formatting
  const sanitizeSummaryHtml = (htmlOrText) => {
    if (!htmlOrText) return '';
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(htmlOrText) || htmlOrText.includes('<br');
    const raw = looksLikeHtml ? htmlOrText : String(htmlOrText).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'b','strong','i','em','u','br','p','ul','ol','li','a',
        'h1','h2','h3','h4','h5','h6','span','div','pre','code','blockquote','hr','sup','sub'
      ],
      ALLOWED_ATTR: ['href','target','rel'],
      ADD_ATTR: ['target','rel']
    });
  };

  // Filter out "Who viewed me" / "Who your viewers also viewed" data
  const filterViewerData = (experiences) => {
    if (!experiences) return [];
    return experiences.filter(exp => {
      const isViewerData =
        exp.title?.startsWith('Someone at') ||
        exp.company?.startsWith('Someone at') ||
        exp.title?.includes('…') ||
        exp.title?.includes('...') ||
        (exp.title?.match(/\bat\b/i) && !exp.company && !exp.dates && !exp.from && !exp.to) ||
        ((!exp.dates && !exp.from && !exp.to) && !exp.company && exp.title);
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
        proj.title?.includes('...');
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

  // Filter out viewer data from patents
  const filterPatentsData = (patents) => {
    if (!patents) return [];
    return patents.filter(patent => {
      const isViewerData =
        patent.title?.startsWith('Someone at') ||
        patent.title?.includes('…') ||
        (!patent.number && !patent.url && !patent.description);
      return !isViewerData;
    });
  };

  // Build a stable key per item for exclusion tracking
  const makeKey = (section, item) => {
    try {
      switch (section) {
        case 'experience':
          return `${section}|${item.title || ''}|${item.company || ''}|${item.dates || `${item.from || ''}-${item.to || ''}`}|${item.location || ''}`;
        case 'education':
          return `${section}|${item.school || ''}|${item.degree || ''}|${item.field || ''}|${item.duration || ''}`;
        case 'certifications':
          return `${section}|${item.name || ''}|${item.issuer || ''}|${item.date || ''}`;
        case 'projects':
          return `${section}|${item.title || ''}|${item.date || ''}|${item.url || ''}`;
        case 'volunteer':
          return `${section}|${item.role || ''}|${item.organization || ''}|${item.date || ''}|${item.duration || ''}`;
        case 'publications':
          return `${section}|${item.title || ''}|${item.publisher || ''}|${item.date || ''}|${item.url || ''}`;
        case 'honors':
          return `${section}|${item.title || ''}|${item.issuer || ''}|${item.date || ''}`;
        case 'languages':
          return `${section}|${item || ''}`;
        case 'patents':
          return `${section}|${item.title || ''}|${item.number || ''}|${item.issuer || ''}|${item.date || ''}|${item.url || ''}`;
        case 'skills':
          return `${section}|${item || ''}`;
        default:
          return `${section}|${JSON.stringify(item)}`;
      }
    } catch (e) {
      return `${section}|${String(item)}`;
    }
  };

  const isExcluded = (section, item) => {
    const key = makeKey(section, item);
    return excludedKeys.includes(key);
  };

  const excludeItem = (section, item) => {
    const key = makeKey(section, item);
    setExcludedKeys(prev => (prev.includes(key) ? prev : [...prev, key]));
  };

  const clearExclusions = () => setExcludedKeys([]);

  const isSectionHidden = (section) => hiddenSections.includes(section);
  const hideSection = (section) => setHiddenSections((prev) => (prev.includes(section) ? prev : [...prev, section]));
  const clearHiddenSections = () => setHiddenSections([]);

  // Apply viewer-data filters and user exclusions
  const filteredForScreen = draftData ? {
    experience: isSectionHidden('experience') ? [] : filterViewerData(draftData.experience).filter(exp => !isExcluded('experience', exp)),
    education: isSectionHidden('education') ? [] : (draftData.education || []).filter(edu => !isExcluded('education', edu)),
    certifications: isSectionHidden('certifications') ? [] : filterCertificationViewerData(draftData.certifications).filter(cert => !isExcluded('certifications', cert)),
    projects: isSectionHidden('projects') ? [] : filterProjectsData(draftData.projects).filter(proj => !isExcluded('projects', proj)),
    volunteer: isSectionHidden('volunteer') ? [] : filterVolunteeringData(draftData.volunteer).filter(vol => !isExcluded('volunteer', vol)),
    publications: isSectionHidden('publications') ? [] : filterPublicationsData(draftData.publications).filter(pub => !isExcluded('publications', pub)),
    honors: isSectionHidden('honors') ? [] : filterHonorsData(draftData.honors).filter(honor => !isExcluded('honors', honor)),
    languages: isSectionHidden('languages') ? [] : filterLanguagesData(draftData.languages).filter(lang => !isExcluded('languages', lang)),
    patents: isSectionHidden('patents') ? [] : filterPatentsData(draftData.patents).filter(patent => !isExcluded('patents', patent)),
    skills: isSectionHidden('skills') ? [] : (draftData.skills || []).filter(skill => !isExcluded('skills', skill))
  } : null;

  const filteredForPrint = draftData ? {
    ...draftData,
    // if summary is hidden, drop it from print
    about: isSectionHidden('summary') ? '' : draftData.about,
    aboutHtml: isSectionHidden('summary') ? '' : draftData.aboutHtml,
    experience: filteredForScreen.experience,
    education: filteredForScreen.education,
    certifications: filteredForScreen.certifications,
    projects: filteredForScreen.projects,
    volunteer: filteredForScreen.volunteer,
    publications: filteredForScreen.publications,
    honors: filteredForScreen.honors,
    languages: filteredForScreen.languages,
    patents: filteredForScreen.patents,
    skills: filteredForScreen.skills
  } : null;

  // keep draftData in sync when new linkedinData arrives
  useEffect(() => {
    if (linkedinData) {
      // Create a shallow clone; objects inside remain same references
      const cloned = {
        ...linkedinData,
        experience: Array.isArray(linkedinData.experience) ? [...linkedinData.experience] : [],
        education: Array.isArray(linkedinData.education) ? [...linkedinData.education] : [],
        certifications: Array.isArray(linkedinData.certifications) ? [...linkedinData.certifications] : [],
        projects: Array.isArray(linkedinData.projects) ? [...linkedinData.projects] : [],
        volunteer: Array.isArray(linkedinData.volunteer) ? [...linkedinData.volunteer] : [],
        publications: Array.isArray(linkedinData.publications) ? [...linkedinData.publications] : [],
        honors: Array.isArray(linkedinData.honors) ? [...linkedinData.honors] : [],
        languages: Array.isArray(linkedinData.languages) ? [...linkedinData.languages] : [],
        patents: Array.isArray(linkedinData.patents) ? [...linkedinData.patents] : [],
        skills: Array.isArray(linkedinData.skills) ? [...linkedinData.skills] : []
      };
      setDraftData(cloned);
      // Initialize/merge section order on first data load
      const available = DEFAULT_SECTION_ORDER.filter((id) => {

          // Dedupe duplicated summary text that sometimes appears in scraped HTML
          const dedupAbout = dedupeRepeatedText(linkedinData.aboutHtml || linkedinData.about || '');
          cloned.about = dedupAbout;
          // Rebuild aboutHtml from deduped text to avoid duplicated HTML blocks
          cloned.aboutHtml = sanitizeSummaryHtml(dedupAbout);
        if (id === 'summary') return typeof linkedinData.about !== 'undefined';
        return Array.isArray(linkedinData[id]);
      });
      setSectionOrder((prev) => {
        const merged = [...prev.filter((s) => available.includes(s)), ...available.filter((s) => !prev.includes(s))];
        return merged.length ? merged : available;
      });
    } else {
      setDraftData(null);
    }
  }, [linkedinData]);

  // Restore saved profile URL from localStorage on load
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('profileUrl');
      if (saved) setProfileUrl(saved);
    } catch {}
  }, []);

  // Persist profile URL when changed
  useEffect(() => {
    try {
      if (profileUrl) window.localStorage.setItem('profileUrl', profileUrl);
    } catch {}
  }, [profileUrl]);

  // Reorder logic: sections and items
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const a = active.id;
    const b = over.id;
    if (typeof a !== 'string' || typeof b !== 'string') return;
    // Item drag: ids in format section:index
    if (a.includes(':') && b.includes(':')) {
      const [sa, ia] = a.split(':');
      const [sb, ib] = b.split(':');
      if (sa !== sb) return; // do not mix sections
      const from = parseInt(ia, 10);
      const to = parseInt(ib, 10);
      // Move in visible list and rebuild underlying array
      setDraftData((prev) => {
        if (!prev) return prev;
        const full = Array.isArray(prev[sa]) ? [...prev[sa]] : [];
        const visible = Array.isArray(filteredForScreen?.[sa]) ? [...filteredForScreen[sa]] : [];
        if (!visible.length) return prev;
        const visibleIds = new Set(visible.map((item) => makeKey(sa, item)));
        const hiddenItems = full.filter((item) => !visibleIds.has(makeKey(sa, item)));
        const newVisible = arrayMove(visible, from, to);
        return { ...prev, [sa]: [...newVisible, ...hiddenItems] };
      });
      return;
    }
    // Section drag: ids are section names
    const fromIdx = sectionOrder.indexOf(a);
    const toIdx = sectionOrder.indexOf(b);
    if (fromIdx === -1 || toIdx === -1) return;
    setSectionOrder((prev) => arrayMove(prev, fromIdx, toIdx));
  };

  const isValidProfileUrl = (url) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      const hostOk = /(^|\.)linkedin\.com$/.test(u.hostname);
      const pathOk = /^\/in\//.test(u.pathname);
      return hostOk && pathOk;
    } catch {
      return false;
    }
  };

  // Helper to update a top-level scalar field
  const updateTopField = (field, value) => {
    setDraftData(prev => prev ? { ...prev, [field]: value } : prev);
  };

  // Helper to update an array item by original object reference
  const updateArrayItem = (section, originalItem, updater) => {
    setDraftData(prev => {
      if (!prev || !Array.isArray(prev[section])) return prev;
      const arr = prev[section];
      const idx = arr.indexOf(originalItem);
      if (idx === -1) return prev;
      const updatedItem = updater({ ...(arr[idx] || {}) });
      const newArr = [...arr];
      newArr[idx] = updatedItem;
      return { ...prev, [section]: newArr };
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
    setStatus('Starting using saved session...');
    try {
      const response = await fetch(`${API_URL}/api/start-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: true })
      });
      const data = await response.json();
      if (data.success) {
        setBrowserOpen(true);
        setStatus('✅ Checking login status...');
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
        body: JSON.stringify({ profileUrl: isValidProfileUrl(profileUrl) ? profileUrl : 'https://www.linkedin.com/in/williamhgates/' })
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
        body: JSON.stringify({ profileUrl: isValidProfileUrl(profileUrl) ? profileUrl : 'https://www.linkedin.com/in/williamhgates/' })
      });

      const result = await response.json();

      if (result.success) {
        setLinkedinData(result.data);
        setStatus(`✅ Data extracted successfully!\n\n📊 Found:\n  • ${result.data.experience.length} experiences\n  • ${result.data.education.length} education entries\n  • ${result.data.projects?.length || 0} projects\n  • ${result.data.volunteer?.length || 0} volunteering\n  • ${result.data.publications?.length || 0} publications\n  • ${result.data.honors?.length || 0} honors\n  • ${result.data.languages?.length || 0} languages\n  • ${result.data.patents?.length || 0} patents\n  • ${result.data.skills.length} skills\n  • ${result.data.certifications.length} certifications`);
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

  // Default streamlined sequence (used when DEBUG === false)
  const runDefaultSequence = async () => {
    if (!isValidProfileUrl(profileUrl)) {
      setStatus('❌ Please enter a valid LinkedIn profile URL (e.g., https://www.linkedin.com/in/your-handle/)');
      return;
    }

    setLoading(true);
    setStatus('🚀 Starting sequence...');
    try {
      // 1) Start browser in headless mode (reuse saved session if present)
      const startRes = await fetch(`${API_URL}/api/start-browser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: true })
      });
      const startData = await startRes.json();
      if (!startData.success) throw new Error(startData.error || 'Failed to start headless browser');
      setStatus('👻 Getting LinkedIn data...');

      // 2) Scrape profile directly (navigation happens inside endpoint)
      const scrapeRes = await fetch(`${API_URL}/api/scrape-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl })
      });

      // Handle unauthorized (not logged in) explicitly
      if (scrapeRes.status === 401) {
        const err = await scrapeRes.json().catch(() => ({ error: 'Not logged in' }));
        throw new Error(err.error || 'Not logged in. Please login once in visible mode to save the session.');
      }

      const result = await scrapeRes.json();
      if (!result.success) throw new Error(result.error || 'Scrape failed');

      setLinkedinData(result.data);
      setStatus('✅ LinkedIn data extracted successfully!');

    } catch (error) {
      setStatus(`❌ Default sequence failed: ${error.message}`);
    } finally {
      // 3) Close browser to keep things tidy
      try {
        await fetch(`${API_URL}/api/close-browser`, { method: 'POST' });
      } catch {}
      setBrowserOpen(false);
      setLoggedIn(false);
      setLoading(false);
    }
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
    const base = draftData || linkedinData;
    if (!base) return;
    const filteredData = {
      ...base,
      experience: filterViewerData(base.experience),
      projects: filterProjectsData(base.projects),
      certifications: filterCertificationViewerData(base.certifications),
      volunteer: filterVolunteeringData(base.volunteer),
      publications: filterPublicationsData(base.publications),
      honors: filterHonorsData(base.honors),
      languages: filterLanguagesData(base.languages),
      patents: filterPatentsData(base.patents)
    };

    console.log(`Filtered ${(base.experience?.length || 0) - (filteredData.experience?.length || 0)} viewer entries from experiences`);
    console.log(`Filtered ${(base.projects?.length || 0) - (filteredData.projects?.length || 0)} viewer entries from projects`);
    console.log(`Filtered ${(base.certifications?.length || 0) - (filteredData.certifications?.length || 0)} viewer entries from certifications`);
    console.log(`Filtered ${(base.volunteer?.length || 0) - (filteredData.volunteer?.length || 0)} viewer entries from volunteering`);
    console.log(`Filtered ${(base.publications?.length || 0) - (filteredData.publications?.length || 0)} viewer entries from publications`);
    console.log(`Filtered ${(base.honors?.length || 0) - (filteredData.honors?.length || 0)} viewer entries from honors`);
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
      <h1 className="title">Build CV using LinkedIn Profile</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <label style={{ whiteSpace: 'nowrap', fontSize: 14, color: '#374151' }}>Profile URL</label>
        <input
          type="url"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value.trim())}
          placeholder="https://www.linkedin.com/in/your-handle/"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          title={!profileUrl || isValidProfileUrl(profileUrl) ? '' : 'Enter a valid LinkedIn profile URL'}
        />
        {!DEBUG && (
          <button
            onClick={runDefaultSequence}
            disabled={loading || !isValidProfileUrl(profileUrl)}
            className="button-minimal"
            title="Builds your profile from LinkedIn using the provided URL"
          >
            {loading ? 'Building…' : 'Build Profile'}
          </button>
        )}
      </div>

      {/* <div className="instructions">
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
            <li><strong>Publications, Honors & Awards, Patents</strong></li>
          </ul>
        </div>

        <p style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
          💡 The extraction takes 20-30 seconds and automatically expands all sections
        </p>
      </div> */}

      <div className="button-group">
        {DEBUG ? (
          <>
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
                <button onClick={extractData} disabled={loading || !isValidProfileUrl(profileUrl)} className="button" style={{ background: '#10b981', fontSize: '18px', padding: '16px 32px' }}>
                  {loading ? '⏳ Extracting Data... (20-30s)' : '📊 Extract All My Data'}
                </button>
                <button onClick={switchToHeadless} disabled={loading} className="button" style={{ background: '#8b5cf6', fontSize: '14px' }}>
                  {loading ? 'Switching...' : '👻 Switch to Headless Mode'}
                </button>
                <button onClick={navigateToProfile} disabled={loading || !isValidProfileUrl(profileUrl)} className="button" style={{ background: '#6b7280', fontSize: '14px' }}>
                  {loading ? 'Navigating...' : '🧭 Go to Profile (optional)'}
                </button>
              </>
            )}

            {browserOpen && (
              <button onClick={closeBrowser} className="button" style={{ background: '#ef4444' }}>
                ❌ Close Browser
              </button>
            )}
          </>
        ) : null}
      </div>

      {status && (
        <div className={status.includes('❌') ? 'error' : 'status'} style={{ marginTop: 20, whiteSpace: 'pre-line' }}>
          {status}
        </div>
      )}

      {DEBUG && browserOpen && (
        <div className="logs-panel" style={{ marginTop: 20 }}>
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

      {draftData && (
        <div className="result">
          <div className="cv-actions" style={{ marginBottom: 12 }}>
            <button
              onClick={() => {
                setDraftData(linkedinData);
                clearExclusions();
                clearHiddenSections();
              }}
              className="button"
              style={{ background: '#0ea5e9' }}
              title="Restore original scraped data and undo removals"
            >
              ↩️ Reset Any Edits
            </button>
          </div>

          {/* Visual Profile (Interactive, on-screen) */}
          {/* SECTION 1: HEADER - Contact & Profile Summary */}
          <div className="profile-header">
            {draftData.image && (
              <img src={draftData.image} alt="Profile" className="profile-photo" />
            )}
            <div className="profile-info">
              <h1 className="profile-name">
                <EditableText
                  value={draftData.name || ''}
                  placeholder="Your Name"
                  onChange={(v) => updateTopField('name', v)}
                />
              </h1>
              <div className="profile-headline">
                <EditableText
                  value={draftData.headline || ''}
                  placeholder="Headline"
                  onChange={(v) => updateTopField('headline', v)}
                />
              </div>
              <div className="profile-location">📍
                <EditableText
                  className="inline-edit"
                  value={draftData.location || ''}
                  placeholder="Location"
                  onChange={(v) => updateTopField('location', v)}
                />
              </div>
            </div>
          </div>

          {/* Drag-and-drop context wrapping interactive sections */}
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {/* Section reorder UI */}
            <div className="cv-actions" style={{ marginBottom: 12 }}>
              <button
                onClick={() => setShowReorderSections((v) => !v)}
                className="button-minimal"
                title="Reorder sections visually"
              >{showReorderSections ? '✅ Done Reordering Sections' : '↕️ Reorder Sections'}</button>
            </div>

            {showReorderSections && (
              <SortableContext items={[...new Set(sectionOrder)]} strategy={verticalListSortingStrategy}>
                <div className="section-order" style={{ marginBottom: 16 }}>
                  {[...new Set(sectionOrder)].map((secId) => (
                    <SortableRow key={secId} id={secId}>
                      <span className="section-chip">{secId}</span>
                    </SortableRow>
                  ))}
                </div>
              </SortableContext>
            )}

            {/* Build section elements and render in chosen order */}
            {(() => {
              const sectionElements = {};

              // Summary
              if (typeof draftData.about !== 'undefined' && !isSectionHidden('summary')) {
                sectionElements.summary = (
                  <CollapsibleSection
                    title={<>Professional Summary</>}
                    actions={(
                      <button
                        onClick={() => hideSection('summary')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="summary"
                  >
                    <EditableText
                      tag="div"
                      className="about-text"
                      allowHtml
                      value={draftData.aboutHtml || draftData.about || ''}
                      placeholder="Add a short professional summary..."
                      onChange={(v) => setDraftData(prev => prev ? { ...prev, aboutHtml: v } : prev)}
                    />
                  </CollapsibleSection>
                );
              }

              // Skills (with sorting by dragging badges)
              if (filteredForScreen && filteredForScreen.skills && filteredForScreen.skills.length > 0 && !isSectionHidden('skills')) {
                sectionElements.skills = (
                  <CollapsibleSection
                    title={<>🛠️ Core Skills & Expertise</>}
                    actions={(
                      <button
                        onClick={() => hideSection('skills')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="skills"
                  >
                    <SortableContext items={filteredForScreen.skills.map((_, i) => getItemId('skills', i))} strategy={verticalListSortingStrategy}>
                      <div className="skills-grid">
                        {filteredForScreen.skills.slice(0, 15).map((skill, i) => (
                          <SortableRow key={getItemId('skills', i)} id={getItemId('skills', i)}>
                            <span className="skill-badge skill-primary" style={{ position: 'relative' }}>
                              <EditableText
                                value={skill}
                                onChange={(v) => {
                                  const idx = draftData.skills.indexOf(skill);
                                  if (idx > -1) {
                                    setDraftData(prev => {
                                      const next = { ...prev, skills: [...(prev.skills || [])] };
                                      next.skills[idx] = v;
                                      return next;
                                    });
                                  }
                                }}
                              />
                              <button
                                onClick={() => excludeItem('skills', skill)}
                                title="Remove skill"
                                aria-label="Remove skill"
                                className="icon-button icon-button--small icon-button--danger"
                                style={{ position: 'absolute', top: -6, right: -6 }}
                              >✕</button>
                            </span>
                          </SortableRow>
                        ))}
                      </div>
                      {filteredForScreen.skills.length > 15 && (
                        <details className="skills-expand">
                          <summary className="skills-expand-btn">
                            View all {filteredForScreen.skills.length} skills
                          </summary>
                          <div className="skills-grid" style={{ marginTop: 12 }}>
                            {filteredForScreen.skills.slice(15).map((skill, i) => (
                              <SortableRow key={getItemId('skills', 15 + i)} id={getItemId('skills', 15 + i)}>
                                <span className="skill-badge" style={{ position: 'relative' }}>
                                  <EditableText
                                    value={skill}
                                    onChange={(v) => {
                                      const idx = draftData.skills.indexOf(skill);
                                      if (idx > -1) {
                                        setDraftData(prev => {
                                          const next = { ...prev, skills: [...(prev.skills || [])] };
                                          next.skills[idx] = v;
                                          return next;
                                        });
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => excludeItem('skills', skill)}
                                    title="Remove skill"
                                    aria-label="Remove skill"
                                    className="icon-button icon-button--small icon-button--danger"
                                    style={{ position: 'absolute', top: -6, right: -6 }}
                                  >✕</button>
                                </span>
                              </SortableRow>
                            ))}
                          </div>
                        </details>
                      )}
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Experience (sortable)
              if (filteredForScreen && filteredForScreen.experience && filteredForScreen.experience.length > 0 && !isSectionHidden('experience')) {
                sectionElements.experience = (
                  <CollapsibleSection
                    title={<>💼 Professional Experience</>}
                    actions={(
                      <button
                        onClick={() => hideSection('experience')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="experience"
                  >
                    <div className="experience-count">
                      {filteredForScreen.experience.length} positions
                    </div>
                    <SortableContext items={filteredForScreen.experience.map((_, i) => getItemId('experience', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.experience.map((exp, i) => (
                          <SortableRow key={getItemId('experience', i)} id={getItemId('experience', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={exp.title || ''}
                                    placeholder="Title"
                                    onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, title: v }))}
                                  />
                                </h3>
                                <div className="experience-company">
                                  <EditableText
                                    value={exp.company || ''}
                                    placeholder="Company"
                                    onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, company: v }))}
                                  />
                                </div>
                                <div className="experience-meta">
                                  {(() => {
                                    if (exp.from || exp.to) {
                                      return (
                                        <span className="experience-duration">
                                          <EditableText
                                            className="inline-edit"
                                            value={exp.from || ''}
                                            placeholder="From"
                                            onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, from: v }))}
                                          />
                                          {' – '}
                                          <EditableText
                                            className="inline-edit"
                                            value={exp.to || ''}
                                            placeholder="To"
                                            onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, to: v }))}
                                          />
                                        </span>
                                      );
                                    }
                                    const display = exp.dates || exp.duration || '';
                                    return display ? (
                                      <span className="experience-duration">
                                        <EditableText
                                          value={display}
                                          placeholder="Dates"
                                          onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, dates: v }))}
                                        />
                                      </span>
                                    ) : null;
                                  })()}
                                  {typeof exp.location !== 'undefined' && (
                                    <span className="experience-location">•
                                      <EditableText
                                        className="inline-edit"
                                        value={exp.location || ''}
                                        placeholder="Location"
                                        onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, location: v }))}
                                      />
                                    </span>
                                  )}
                                </div>
                                {typeof exp.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={exp.description || ''}
                                      placeholder="What did you do?"
                                      onChange={(v) => updateArrayItem('experience', exp, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                {Array.isArray(exp.contextual_skills) && exp.contextual_skills.length > 0 && (
                                  <div className="experience-skills">
                                    {exp.contextual_skills.map((s, idx) => (
                                      <span key={idx} className="skill-badge">{s}</span>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('experience', exp)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this experience"
                                    aria-label="Remove experience"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Education (sortable)
              if (filteredForScreen && filteredForScreen.education && filteredForScreen.education.length > 0 && !isSectionHidden('education')) {
                sectionElements.education = (
                  <CollapsibleSection
                    title={<>🎓 Education</>}
                    actions={(
                      <button
                        onClick={() => hideSection('education')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="education"
                  >
                    <SortableContext items={filteredForScreen.education.map((_, i) => getItemId('education', i))} strategy={verticalListSortingStrategy}>
                      <div className="education-list">
                        {filteredForScreen.education.map((edu, i) => (
                          <SortableRow key={getItemId('education', i)} id={getItemId('education', i)}>
                            <div className="education-item">
                              <h3 className="education-school">
                                <EditableText
                                  value={edu.school || ''}
                                  placeholder="School"
                                  onChange={(v) => updateArrayItem('education', edu, (it) => ({ ...it, school: v }))}
                                />
                              </h3>
                              <div className="education-degree">
                                <EditableText
                                  value={edu.degree || ''}
                                  placeholder="Degree"
                                  onChange={(v) => updateArrayItem('education', edu, (it) => ({ ...it, degree: v }))}
                                />
                                {" "}
                                {typeof edu.field !== 'undefined' && (
                                  <>
                                    {"• "}
                                    <EditableText
                                      value={edu.field || ''}
                                      placeholder="Field"
                                      onChange={(v) => updateArrayItem('education', edu, (it) => ({ ...it, field: v }))}
                                    />
                                  </>
                                )}
                              </div>
                              <div className="education-duration">
                                <EditableText
                                  value={edu.duration || ''}
                                  placeholder="Duration"
                                  onChange={(v) => updateArrayItem('education', edu, (it) => ({ ...it, duration: v }))}
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button
                                  onClick={() => excludeItem('education', edu)}
                                  className="icon-button icon-button--danger"
                                  title="Remove this education"
                                  aria-label="Remove education"
                                >🗑️</button>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Certifications (sortable)
              if (filteredForScreen && filteredForScreen.certifications && filteredForScreen.certifications.length > 0 && !isSectionHidden('certifications')) {
                sectionElements.certifications = (
                  <CollapsibleSection
                    title={<>📜 Certifications & Credentials</>}
                    actions={(
                      <button
                        onClick={() => hideSection('certifications')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="certifications"
                  >
                    <SortableContext items={filteredForScreen.certifications.map((_, i) => getItemId('certifications', i))} strategy={verticalListSortingStrategy}>
                      <div className="certifications-grid">
                        {filteredForScreen.certifications.map((cert, i) => (
                          <SortableRow key={getItemId('certifications', i)} id={getItemId('certifications', i)}>
                            <div className="certification-item">
                              <div className="certification-name">
                                <EditableText
                                  value={cert.name || ''}
                                  placeholder="Certification"
                                  onChange={(v) => updateArrayItem('certifications', cert, (it) => ({ ...it, name: v }))}
                                />
                              </div>
                              <div className="certification-issuer">
                                <EditableText
                                  value={cert.issuer || ''}
                                  placeholder="Issuer"
                                  onChange={(v) => updateArrayItem('certifications', cert, (it) => ({ ...it, issuer: v }))}
                                />
                              </div>
                              <div className="certification-date">
                                <EditableText
                                  value={cert.date || ''}
                                  placeholder="Date"
                                  onChange={(v) => updateArrayItem('certifications', cert, (it) => ({ ...it, date: v }))}
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button
                                  onClick={() => excludeItem('certifications', cert)}
                                  className="icon-button icon-button--danger"
                                  title="Remove this certification"
                                  aria-label="Remove certification"
                                >🗑️</button>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Projects (sortable)
              if (filteredForScreen && filteredForScreen.projects && filteredForScreen.projects.length > 0 && !isSectionHidden('projects')) {
                sectionElements.projects = (
                  <CollapsibleSection
                    title={<>🚀 Projects</>}
                    actions={(
                      <button
                        onClick={() => hideSection('projects')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="projects"
                  >
                    <SortableContext items={filteredForScreen.projects.map((_, i) => getItemId('projects', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.projects.map((proj, i) => (
                          <SortableRow key={getItemId('projects', i)} id={getItemId('projects', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={proj.title || ''}
                                    placeholder="Project Title"
                                    onChange={(v) => updateArrayItem('projects', proj, (it) => ({ ...it, title: v }))}
                                  />
                                  {proj.url && (
                                    <span style={{ marginLeft: 6 }}>
                                      <a href={proj.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>🔗</a>
                                    </span>
                                  )}
                                </h3>
                                <div className="experience-meta">
                                  <span className="experience-duration">
                                    <EditableText
                                      value={proj.date || ''}
                                      placeholder="Date"
                                      onChange={(v) => updateArrayItem('projects', proj, (it) => ({ ...it, date: v }))}
                                    />
                                  </span>
                                </div>
                                {typeof proj.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={proj.description || ''}
                                      placeholder="Project details..."
                                      onChange={(v) => updateArrayItem('projects', proj, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                {Array.isArray(proj.contextual_skills) && proj.contextual_skills.length > 0 && (
                                  <div className="experience-skills">
                                    {proj.contextual_skills.map((s, idx) => (
                                      <span key={idx} className="skill-badge">{s}</span>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('projects', proj)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this project"
                                    aria-label="Remove project"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Volunteer (sortable)
              if (filteredForScreen && filteredForScreen.volunteer && filteredForScreen.volunteer.length > 0 && !isSectionHidden('volunteer')) {
                sectionElements.volunteer = (
                  <CollapsibleSection
                    title={<>❤️ Volunteering</>}
                    actions={(
                      <button
                        onClick={() => hideSection('volunteer')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="volunteer"
                  >
                    <SortableContext items={filteredForScreen.volunteer.map((_, i) => getItemId('volunteer', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.volunteer.map((vol, i) => (
                          <SortableRow key={getItemId('volunteer', i)} id={getItemId('volunteer', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={vol.role || ''}
                                    placeholder="Role"
                                    onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, role: v }))}
                                  />
                                </h3>
                                <div className="experience-company">
                                  <EditableText
                                    value={vol.organization || ''}
                                    placeholder="Organization"
                                    onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, organization: v }))}
                                  />
                                </div>
                                <div className="experience-meta">
                                  <span className="experience-duration">
                                    <EditableText
                                      value={vol.date || ''}
                                      placeholder="Date"
                                      onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, date: v }))}
                                    />
                                    {" "}
                                    {typeof vol.duration !== 'undefined' && (
                                      <>
                                        {"• "}
                                        <EditableText
                                          value={vol.duration || ''}
                                          placeholder="Duration"
                                          onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, duration: v }))}
                                        />
                                      </>
                                    )}
                                  </span>
                                  {typeof vol.cause !== 'undefined' && (
                                    <span className="experience-location">•
                                      <EditableText
                                        className="inline-edit"
                                        value={vol.cause || ''}
                                        placeholder="Cause"
                                        onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, cause: v }))}
                                      />
                                    </span>
                                  )}
                                </div>
                                {typeof vol.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={vol.description || ''}
                                      placeholder="What did you do?"
                                      onChange={(v) => updateArrayItem('volunteer', vol, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('volunteer', vol)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this volunteering item"
                                    aria-label="Remove volunteering item"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Publications (sortable)
              if (filteredForScreen && filteredForScreen.publications && filteredForScreen.publications.length > 0 && !isSectionHidden('publications')) {
                sectionElements.publications = (
                  <CollapsibleSection
                    title={<>📚 Publications</>}
                    actions={(
                      <button
                        onClick={() => hideSection('publications')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="publications"
                  >
                    <SortableContext items={filteredForScreen.publications.map((_, i) => getItemId('publications', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.publications.map((pub, i) => (
                          <SortableRow key={getItemId('publications', i)} id={getItemId('publications', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={pub.title || ''}
                                    placeholder="Title"
                                    onChange={(v) => updateArrayItem('publications', pub, (it) => ({ ...it, title: v }))}
                                  />
                                  {pub.url && (
                                    <span style={{ marginLeft: 6 }}>
                                      <a href={pub.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>🔗</a>
                                    </span>
                                  )}
                                </h3>
                                <div className="experience-company">
                                  <EditableText
                                    value={pub.publisher || ''}
                                    placeholder="Publisher"
                                    onChange={(v) => updateArrayItem('publications', pub, (it) => ({ ...it, publisher: v }))}
                                  />
                                </div>
                                <div className="experience-meta">
                                  <span className="experience-duration">
                                    <EditableText
                                      value={pub.date || ''}
                                      placeholder="Date"
                                      onChange={(v) => updateArrayItem('publications', pub, (it) => ({ ...it, date: v }))}
                                    />
                                  </span>
                                </div>
                                {typeof pub.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={pub.description || ''}
                                      placeholder="Summary..."
                                      onChange={(v) => updateArrayItem('publications', pub, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('publications', pub)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this publication"
                                    aria-label="Remove publication"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Honors (sortable)
              if (filteredForScreen && filteredForScreen.honors && filteredForScreen.honors.length > 0 && !isSectionHidden('honors')) {
                sectionElements.honors = (
                  <CollapsibleSection
                    title={<>🏆 Honors & Awards</>}
                    actions={(
                      <button
                        onClick={() => hideSection('honors')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="honors"
                  >
                    <SortableContext items={filteredForScreen.honors.map((_, i) => getItemId('honors', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.honors.map((honor, i) => (
                          <SortableRow key={getItemId('honors', i)} id={getItemId('honors', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={honor.title || ''}
                                    placeholder="Award Title"
                                    onChange={(v) => updateArrayItem('honors', honor, (it) => ({ ...it, title: v }))}
                                  />
                                </h3>
                                <div className="experience-company">
                                  <EditableText
                                    value={honor.issuer || ''}
                                    placeholder="Issuer"
                                    onChange={(v) => updateArrayItem('honors', honor, (it) => ({ ...it, issuer: v }))}
                                  />
                                </div>
                                <div className="experience-meta">
                                  <span className="experience-duration">
                                    <EditableText
                                      value={honor.date || ''}
                                      placeholder="Date"
                                      onChange={(v) => updateArrayItem('honors', honor, (it) => ({ ...it, date: v }))}
                                    />
                                  </span>
                                </div>
                                {typeof honor.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={honor.description || ''}
                                      placeholder="Details..."
                                      onChange={(v) => updateArrayItem('honors', honor, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('honors', honor)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this honor"
                                    aria-label="Remove honor"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Languages (sortable)
              if (filteredForScreen && filteredForScreen.languages && filteredForScreen.languages.length > 0 && !isSectionHidden('languages')) {
                sectionElements.languages = (
                  <CollapsibleSection
                    title={<>🌐 Languages</>}
                    actions={(
                      <button
                        onClick={() => hideSection('languages')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="languages"
                  >
                    <SortableContext items={filteredForScreen.languages.map((_, i) => getItemId('languages', i))} strategy={verticalListSortingStrategy}>
                      <div className="skills-grid">
                        {filteredForScreen.languages.map((language, i) => (
                          <SortableRow key={getItemId('languages', i)} id={getItemId('languages', i)}>
                            <span className="skill-badge skill-primary" style={{ position: 'relative' }}>
                              <EditableText
                                value={language}
                                onChange={(v) => {
                                  const idx = draftData.languages.indexOf(language);
                                  if (idx > -1) {
                                    setDraftData(prev => {
                                      const next = { ...prev, languages: [...(prev.languages || [])] };
                                      next.languages[idx] = v;
                                      return next;
                                    });
                                  }
                                }}
                              />
                              <button
                                onClick={() => excludeItem('languages', language)}
                                title="Remove language"
                                aria-label="Remove language"
                                className="icon-button icon-button--small icon-button--danger"
                                style={{ position: 'absolute', top: -6, right: -6 }}
                              >✕</button>
                            </span>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Patents (sortable)
              if (filteredForScreen && filteredForScreen.patents && filteredForScreen.patents.length > 0 && !isSectionHidden('patents')) {
                sectionElements.patents = (
                  <CollapsibleSection
                    title={<>💡 Patents</>}
                    actions={(
                      <button
                        onClick={() => hideSection('patents')}
                        className="icon-button icon-button--danger"
                        title="Remove this section"
                        aria-label="Remove section"
                      >🗑️</button>
                    )}
                    persistKey="patents"
                  >
                    <SortableContext items={filteredForScreen.patents.map((_, i) => getItemId('patents', i))} strategy={verticalListSortingStrategy}>
                      <div className="timeline">
                        {filteredForScreen.patents.map((patent, i) => (
                          <SortableRow key={getItemId('patents', i)} id={getItemId('patents', i)}>
                            <div className="experience-item">
                              <div className="experience-content">
                                <h3 className="experience-title">
                                  <EditableText
                                    value={patent.title || ''}
                                    placeholder="Patent Title"
                                    onChange={(v) => updateArrayItem('patents', patent, (it) => ({ ...it, title: v }))}
                                  />
                                  {patent.url && (
                                    <span style={{ marginLeft: 6 }}>
                                      <a href={patent.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>🔗</a>
                                    </span>
                                  )}
                                </h3>
                                {patent.number && (
                                  <div className="experience-company">Patent Number: {" "}
                                    <EditableText
                                      className="inline-edit"
                                      value={patent.number || ''}
                                      placeholder="Number"
                                      onChange={(v) => updateArrayItem('patents', patent, (it) => ({ ...it, number: v }))}
                                    />
                                  </div>
                                )}
                                <div className="experience-meta">
                                  {typeof patent.issuer !== 'undefined' && (
                                    <span className="experience-company">
                                      <EditableText
                                        value={patent.issuer || ''}
                                        placeholder="Issuer"
                                        onChange={(v) => updateArrayItem('patents', patent, (it) => ({ ...it, issuer: v }))}
                                      />
                                    </span>
                                  )}
                                  {typeof patent.date !== 'undefined' && (
                                    <span className="experience-duration">•
                                      <EditableText
                                        className="inline-edit"
                                        value={patent.date || ''}
                                        placeholder="Date"
                                        onChange={(v) => updateArrayItem('patents', patent, (it) => ({ ...it, date: v }))}
                                      />
                                    </span>
                                  )}
                                </div>
                                {typeof patent.description !== 'undefined' && (
                                  <div className="experience-description">
                                    <EditableText
                                      tag="div"
                                      value={patent.description || ''}
                                      placeholder="Details..."
                                      onChange={(v) => updateArrayItem('patents', patent, (it) => ({ ...it, description: v }))}
                                    />
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button
                                    onClick={() => excludeItem('patents', patent)}
                                    className="icon-button icon-button--danger"
                                    title="Remove this patent"
                                    aria-label="Remove patent"
                                  >🗑️</button>
                                </div>
                              </div>
                            </div>
                          </SortableRow>
                        ))}
                      </div>
                    </SortableContext>
                  </CollapsibleSection>
                );
              }

              // Render in chosen order
              return (
                <div>
                  {[...new Set(sectionOrder)].map((id) => sectionElements[id]).filter(Boolean)}
                </div>
              );
            })()}

          </DndContext>


          {DEBUG && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button onClick={downloadData} className="button" style={{ background: '#374151' }}>
                  💾 Download JSON
                </button>
              </div>
              <details>
                <summary style={{ cursor: 'pointer', marginBottom: 8 }}>View Raw JSON</summary>
                <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(linkedinData, null, 2)}</pre>
              </details>
            </div>
          )}

          {/* Printable CV (collapsed by default) */}
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'default', marginBottom: 8 }}>🧾 Printable CV (PDF-friendly)</summary>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={pdfFriendly}
                  onChange={(e) => setPdfFriendly(e.target.checked)}
                />
                PDF-friendly (fewer artificial page breaks)
              </label>
              <button className="button" onClick={() => window.print()} title="Downloads a PDF via browser print">
                🖨️ Print / Save as PDF
              </button>
            </div>
            <CV data={filteredForPrint} />
          </details>
        </div>
      )}
    </div>
  );
}

export default App;
