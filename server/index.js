const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const scrapers = require('./scrapers');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001;
const USER_DATA_DIR = './linkedin-session';

app.use(cors());
app.use(bodyParser.json());

// Build/version marker for runtime verification
const BUILD_VERSION = 'v2025-12-27-console-logs';

// Lightweight version endpoint to confirm active server file
app.get('/api/version', (req, res) => {
  res.json({ version: BUILD_VERSION });
});

let browser = null;
let page = null;
let consoleLogs = []; // Store browser console logs

// Noisy browser messages to suppress from terminal output
const SUPPRESSED_PATTERNS = [
  'net::ERR_FAILED',
  'net::ERR_ABORTED',
  'Failed to load resource',
  'BooleanExpression with operator',
  'Attribute \'exception.tags\'',
  'could not be converted to a proto',
  '<link rel=preload>',
  'GSI_LOGGER',
  'EvalError',
  'Minified React error',
  'JSHandle@error',
  'JSHandle@',
  'TMS load event',
  'visitor.publishDestinations',
  'External tag load event',
  'the server responded with a status of',
  'TypeError: network error',
];

function isSuppressed(text) {
  return SUPPRESSED_PATTERNS.some(p => text.includes(p));
}

// Resource types to block (not needed for DOM scraping, cause net::ERR_FAILED noise)
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);
const BLOCKED_URL_PATTERNS = [
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net',
  'facebook.net', 'fbcdn.net', 'bing.com/bat', 'ads.linkedin.com',
  'snap.licdn.com/li.lms-analytics', 'platform.linkedin.com/litag',
  'demdex.net', 'bat.bing.com', 'lnkd.demdex.net',
];

// Helper: launch browser, create page, wire up console listeners
async function launchBrowser(headless) {
  console.log(`🚀 Starting browser ${headless ? '(headless)' : '(visible)'}...`);

  if (browser) {
    try { await browser.close(); } catch (_) {}
  }

  browser = await puppeteer.launch({
    headless: headless,
    userDataDir: USER_DATA_DIR,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ]
  });

  page = await browser.newPage();

  // Clear previous logs
  consoleLogs = [];

  // Capture browser console output (filter noise from terminal)
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const logEntry = { type, text, timestamp: new Date().toISOString() };
    consoleLogs.push(logEntry);
    // Only print non-noisy messages to terminal
    if (!isSuppressed(text)) {
      console.log(`[Browser ${type.toUpperCase()}]:`, text);
    }
  });

  // capture page errors (filter noise)
  page.on('pageerror', error => {
    const logEntry = { type: 'error', text: error.message, timestamp: new Date().toISOString() };
    consoleLogs.push(logEntry);
    if (!isSuppressed(error.message)) {
      console.log('[Browser ERROR]:', error.message);
    }
  });


  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  return { browser, page };
}

// Helper: check whether the current page looks like a logged-in LinkedIn session
async function isLoggedIn(page) {
  try {
    const url = page.url();
    // URL-based checks
    if (url.includes('authwall') || url.includes('/login') || url.includes('signup') || url.includes('checkpoint')) {
      return false;
    }
    // Positive URL signals
    if (url.includes('linkedin.com/feed') || url.includes('linkedin.com/in/') || url.includes('linkedin.com/mynetwork')) {
      return true;
    }
    // DOM-based check for auth prompts
    const hasAuthPrompt = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return (text.includes('Sign in') && text.includes('Join now')) ||
             text.includes('Sign in to view') ||
             document.querySelector('.authwall-join-form') !== null;
    });
    return !hasAuthPrompt;
  } catch (_) {
    return false;
  }
}

// Endpoint to start browser and login
app.post('/api/start-browser', async (req, res) => {
  try {
    const { headless = false } = req.body;

    await launchBrowser(headless);

    // Navigate to LinkedIn
    const targetUrl = headless ? 'https://www.linkedin.com/feed' : 'https://www.linkedin.com/login';
    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, but page may have loaded. Continuing...');
    }

    await new Promise(r => setTimeout(r, 2000));

    // Report login status so the frontend can decide what to do
    const loggedIn = await isLoggedIn(page);
    console.log(`📋 Browser started (headless=${headless}), loggedIn=${loggedIn}`);

    res.json({
      success: true,
      headless: headless,
      loggedIn: loggedIn,
      message: headless
        ? (loggedIn ? 'Browser started in headless mode. Session is active.' : 'Browser started in headless mode but session is expired.')
        : 'Browser opened! Please login to LinkedIn in the browser window. Session will be saved for future use.'
    });

  } catch (error) {
    console.error('Error starting browser:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to get browser console logs
app.get('/api/console-logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const sinceLogs = consoleLogs.slice(-limit);
  res.json({ logs: sinceLogs, total: consoleLogs.length });
});

// Endpoint to clear console logs
app.post('/api/clear-logs', (req, res) => {
  consoleLogs = [];
  res.json({ success: true, message: 'Logs cleared' });
});

// Endpoint to check if user is logged in
app.get('/api/check-login', async (req, res) => {
  try {
    if (!page) {
      return res.json({ loggedIn: false, message: 'Browser not started' });
    }

    const url = page.url();
    const loggedIn = url.includes('linkedin.com/feed') ||
      url.includes('linkedin.com/in/') ||
      url.includes('linkedin.com/mynetwork');

    res.json({ loggedIn, currentUrl: url });
  } catch (error) {
    res.json({ loggedIn: false, error: error.message });
  }
});

// Helper endpoint to navigate to profile page (for testing)
app.post('/api/navigate-to-profile', async (req, res) => {
  try {
    if (!page || !browser) {
      return res.status(400).json({
        success: false,
        error: 'Browser not started.'
      });
    }

    const profileUrl = req.body.profileUrl || 'https://www.linkedin.com/in/williamhgates/';
    console.log('🔍 Navigating to:', profileUrl);

    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    await new Promise(r => setTimeout(r, 2000));

    res.json({
      success: true,
      message: 'Navigated to profile page',
      currentUrl: page.url()
    });

  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to scrape profile data
app.post('/api/scrape-profile', async (req, res) => {
  try {
    console.log('📊 Starting profile scraping...');

    if (!page || !browser) {
      return res.status(400).json({
        success: false,
        error: 'Browser not started. Please start browser first.'
      });
    }

    const profileUrl = req.body.profileUrl || 'https://www.linkedin.com/in/williamhgates/';

    // Navigate to profile
    console.log('🔍 Navigating to:', profileUrl);
    try {
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, but page may have loaded. Continuing...');
    }

    // Wait for LinkedIn's React app to render content
    try {
      await page.waitForSelector('.scaffold-layout__main, main, #main-content', { timeout: 15000 });
      console.log('✓ LinkedIn page content rendered');
    } catch (_) {
      console.log('⚠️ Main content container not found, waiting extra...');
    }
    await new Promise(r => setTimeout(r, 2000));

    // Check if we're on the right page
    const currentUrl = page.url();
    if (currentUrl.includes('authwall') || currentUrl.includes('login') || currentUrl.includes('signup') || currentUrl.includes('checkpoint')) {
      console.log('🚫 Session expired or not logged in. Current URL:', currentUrl);
      return res.status(401).json({
        success: false,
        error: 'Not logged in. Please log in to LinkedIn first.'
      });
    }

    // Wait for profile to load
    try {
      await page.waitForSelector('h1', { timeout: 15000 });
    } catch (e) {
      console.log('⚠️ Could not find h1, checking if session is valid...');
      const hasAuthPrompt = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return (text.includes('Sign in') && text.includes('Join now')) ||
               text.includes('Sign in to view') ||
               document.querySelector('.authwall-join-form') !== null;
      });
      if (hasAuthPrompt) {
        console.log('🚫 LinkedIn is showing a logged-out view. Session has expired.');
        return res.status(401).json({
          success: false,
          error: 'LinkedIn session expired. Please log in first.'
        });
      }
      console.log('⚠️ No h1 found but no auth wall detected, continuing...');
      // Dump diagnostic info to help debug
      const diag = await page.evaluate(() => {
        const url = window.location.href;
        const title = document.title;
        const bodyText = (document.body?.innerText || '').substring(0, 500);
        const allH1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim());
        const allH2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 5);
        return { url, title, bodyText, allH1s, allH2s };
      });
      console.log('🔍 DEBUG profile page diagnosis:');
      console.log(`   URL: ${diag.url}`);
      console.log(`   Title: ${diag.title}`);
      console.log(`   H1s: ${JSON.stringify(diag.allH1s)}`);
      console.log(`   H2s: ${JSON.stringify(diag.allH2s)}`);
      console.log(`   Body text preview: ${diag.bodyText.substring(0, 300)}`);
    }

    // Auto-scroll to load all content
    console.log('📜 Scrolling to load all content...');
    await autoScroll(page);

    // Click all "Show more" buttons - do this multiple times for nested content
    console.log('🔍 Expanding all sections...');
    await expandAllSections(page);

    // Use standardized workflow to extract data from details pages
    let allExperiences = [];
    let allEducation = [];
    let allCertifications = [];
    let allProjects = [];
    let allPublications = []; // New array for publications

    // Extract experiences from details/experience page
    allExperiences = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'experience',
      (p) => p.evaluate(scrapers.extractExperienceData)
    );

    // Extract education from details/education page
    allEducation = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'education',
      (p) => p.evaluate(scrapers.extractEducationData)
    );

    // Extract certifications from details/certifications page
    allCertifications = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'certifications',
      (p) => p.evaluate(scrapers.extractCertificationData)
    );

    // Extract projects from details/projects page
    allProjects = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'projects',
      (p) => p.evaluate(scrapers.extractProjectsData)
    );

    // Extract publications from details/publications page
    allPublications = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'publications',
      (p) => p.evaluate(scrapers.extractPublicationsData)
    );

    // Extract skills from details/skills page
    let allSkills = [];
    allSkills = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'skills',
      (p) => p.evaluate(scrapers.extractSkillsData)
    );

    // Extract volunteering from details/volunteering-experiences page
    let allVolunteering = [];
    allVolunteering = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'volunteering-experiences',
      (p) => p.evaluate(scrapers.extractVolunteeringData)
    );

    // Extract honors from details/honors page
    let allHonors = [];
    allHonors = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'honors',
      (p) => p.evaluate(scrapers.extractHonorsData)
    );

    // Extract languages from details/languages page
    let allLanguages = [];
    allLanguages = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'languages',
      (p) => p.evaluate(scrapers.extractLanguagesData)
    );

    // Extract patents from details/patents page (if it exists)
    let allPatents = [];
    allPatents = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'patents',
      (p) => p.evaluate(scrapers.extractPatentsData)
    );

    console.log('📊 Extracting supplementary data from main profile...');

    // Extract all data
    const data = await page.evaluate(scrapers.extractProfileData);

    // Replace the experience data with what we extracted from the details page
    if (allExperiences.length > 0) {
      data.experience = allExperiences;
      console.log(`✅ Using ${allExperiences.length} experiences from details page`);
    }

    // Replace the education data with what we extracted from the details page
    if (allEducation && allEducation.length > 0) {
      data.education = allEducation;
      console.log(`✅ Using ${allEducation.length} education entries from details page`);
    }

    // Replace the certifications data with what we extracted from the details page
    if (allCertifications && allCertifications.length > 0) {
      data.certifications = allCertifications;
      console.log(`✅ Using ${allCertifications.length} certifications from details page`);
    }

    // Replace the projects data with what we extracted from the details page
    if (allProjects && allProjects.length > 0) {
      data.projects = allProjects;
      console.log(`✅ Using ${allProjects.length} projects from details page`);
    }

    // Replace the publications data with what we extracted from the details page
    if (allPublications && allPublications.length > 0) {
      data.publications = allPublications;
      console.log(`✅ Using ${allPublications.length} publications from details page`);
    }

    // Replace the skills data with what we extracted from the details page
    // allSkills is now an array of {name, associations} objects
    let skillObjects = [];
    if (allSkills && allSkills.length > 0) {
      skillObjects = allSkills;
      // Keep data.skills as flat string array for backward compatibility
      data.skills = allSkills.map(s => typeof s === 'string' ? s : s.name);
      console.log(`✅ Using ${allSkills.length} skills from details page`);
    }

    // Replace the volunteering data with what we extracted from the details page
    if (allVolunteering && allVolunteering.length > 0) {
      data.volunteer = allVolunteering;
      console.log(`✅ Using ${allVolunteering.length} volunteering entries from details page`);
    }

    // Replace the honors data with what we extracted from the details page
    if (allHonors && allHonors.length > 0) {
      data.honors = allHonors;
      console.log(`✅ Using ${allHonors.length} honors entries from details page`);
    }

    // Replace the languages data with what we extracted from the details page
    if (allLanguages && allLanguages.length > 0) {
      data.languages = allLanguages;
      console.log(`✅ Using ${allLanguages.length} languages from details page`);
    }

    // Replace the patents data with what we extracted from the details page
    if (allPatents && allPatents.length > 0) {
      data.patents = allPatents;
      console.log(`✅ Using ${allPatents.length} patents from details page`);
    }

    // Final cleanup: Filter out any viewer data that slipped through
    data.experience = data.experience.filter(exp => {
      const isViewerData =
        exp.title?.startsWith('Someone at') ||
        exp.company?.startsWith('Someone at') ||
        exp.title?.includes('…') ||
        exp.title?.includes('...') ||
        exp.title?.toLowerCase().includes('database developer in the') ||
        (!exp.dates && !exp.company) ||
        (exp.title?.match(/\bat\b/i) && !exp.company && !exp.dates);
      return !isViewerData;
    });

    data.certifications = data.certifications.filter(cert => {
      const isViewerData =
        cert.name?.startsWith('Someone at') ||
        cert.issuer?.startsWith('Someone at') ||
        cert.name?.includes('…') ||
        cert.name?.includes('...') ||
        cert.name?.toLowerCase().includes('database developer in the') ||
        (!cert.issuer && !cert.date);
      return !isViewerData;
    });

    data.education = data.education.filter(edu => {
      const isViewerData =
        edu.school?.startsWith('Someone at') ||
        edu.degree?.startsWith('Someone at') ||
        edu.school?.includes('…') ||
        (!edu.degree && !edu.duration);
      return !isViewerData;
    });

    data.projects = (data.projects || []).filter(proj => {
      const isViewerData =
        proj.title?.startsWith('Someone at') ||
        proj.title?.includes('…') ||
        proj.title?.includes('...');
      return !isViewerData;
    });

    data.volunteer = (data.volunteer || []).filter(vol => {
      const isViewerData =
        vol.role?.startsWith('Someone at') ||
        vol.organization?.startsWith('Someone at') ||
        (!vol.date && !vol.organization);
      return !isViewerData;
    });

    data.honors = (data.honors || []).filter(honor => {
      const isViewerData =
        honor.title?.startsWith('Someone at') ||
        (!honor.date && !honor.issuer);
      return !isViewerData;
    });

    data.publications = (data.publications || []).filter(pub => {
      const isViewerData =
        pub.title?.startsWith('Someone at') ||
        (!pub.date && !pub.publisher && !pub.url);
      return !isViewerData;
    });

    data.patents = (data.patents || []).filter(patent => {
      const isViewerData =
        patent.title?.startsWith('Someone at') ||
        patent.title?.includes('…') ||
        (!patent.number && !patent.url && !patent.description);
      return !isViewerData;
    });

    // ── Associate skills with experiences ──
    // Each skill object has {name, associations} where associations contain
    // text like "3 experiences at Aize and 2 other companies" or
    // "Machine Learning Lead at Buyaladdin.com, Inc"
    if (skillObjects.length > 0 && data.experience.length > 0) {
      console.log('🔗 Matching skills to experiences...');

      // Helper: normalize a string for fuzzy matching
      const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

      // Helper: check if company name matches (fuzzy)
      const companyMatches = (expCompany, assocText) => {
        if (!expCompany || !assocText) return false;
        const normExp = normalize(expCompany);
        const normAssoc = normalize(assocText);
        // Direct substring match
        if (normAssoc.includes(normExp) || normExp.includes(normAssoc)) return true;
        // Strip common suffixes for matching
        const stripSuffixes = (s) => s.replace(/\b(inc|ltd|llc|gmbh|as|a s|corp|co|company|limited|group|plc)\b/g, '').trim();
        const strippedExp = stripSuffixes(normExp);
        const strippedAssoc = stripSuffixes(normAssoc);
        if (strippedExp.length > 2 && (strippedAssoc.includes(strippedExp) || strippedExp.includes(strippedAssoc))) return true;
        return false;
      };

      // Helper: check if job title matches (for single-experience associations like "ML Lead at Company")
      const titleMatches = (expTitle, assocText) => {
        if (!expTitle || !assocText) return false;
        const normTitle = normalize(expTitle);
        const normAssoc = normalize(assocText);
        return normAssoc.includes(normTitle);
      };

      // Initialize skills array on each experience
      data.experience.forEach(exp => { exp.skills = []; });

      let matchCount = 0;
      for (const skillObj of skillObjects) {
        const skillName = typeof skillObj === 'string' ? skillObj : skillObj.name;
        const associations = (typeof skillObj === 'string') ? [] : (skillObj.associations || []);

        if (associations.length === 0) {
          // No association info — skip matching for this skill
          continue;
        }

        for (const assocText of associations) {
          // Parse the association text to determine type:
          // Type A: "N experiences at/across Company and M other companies"
          // Type B: "JobTitle at Company" (single experience)
          const multiMatch = assocText.match(/(\d+)\s*experiences?\s*(?:across|at)\s+(.+?)(?:\s+and\s+\d+\s+other\s+compan)/i);
          const singleMatch = assocText.match(/^(.+?)\s+at\s+(.+)$/i);

          if (multiMatch) {
            // Multi-experience: extract the named company
            const namedCompany = multiMatch[2].trim();
            for (const exp of data.experience) {
              if (companyMatches(exp.company, namedCompany)) {
                if (!exp.skills.includes(skillName)) {
                  exp.skills.push(skillName);
                  matchCount++;
                }
              }
            }
          } else if (singleMatch) {
            // Single experience: "JobTitle at Company"
            const jobTitle = singleMatch[1].trim();
            const company = singleMatch[2].trim();
            for (const exp of data.experience) {
              // Match by both title+company or just company
              if (companyMatches(exp.company, company) &&
                  (titleMatches(exp.title, jobTitle) || !jobTitle)) {
                if (!exp.skills.includes(skillName)) {
                  exp.skills.push(skillName);
                  matchCount++;
                }
              }
            }
          }

          // Also try to match against ALL experiences by company name from the full text
          for (const exp of data.experience) {
            if (exp.company && companyMatches(exp.company, assocText)) {
              if (!exp.skills.includes(skillName)) {
                exp.skills.push(skillName);
                matchCount++;
              }
            }
          }
        }
      }

      console.log(`✅ Matched ${matchCount} skill-experience associations`);
      // Log summary per experience
      for (const exp of data.experience) {
        if (exp.skills.length > 0) {
          console.log(`   ${exp.title} @ ${exp.company}: ${exp.skills.length} skills`);
        }
      }
    }

    console.log('✅ Data extraction complete!');
    console.log('📋 Extracted:', {
      name: data.name,
      experience: data.experience.length,
      education: data.education.length,
      skills: data.skills.length,
      certifications: data.certifications.length,
      volunteering: data.volunteer?.length || 0,
      publications: data.publications?.length || 0,
      honors: data.honors?.length || 0,
      languages: data.languages?.length || 0,
      patents: data.patents?.length || 0
    });

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error scraping profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint to close browser
app.post('/api/close-browser', async (req, res) => {
  try {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
      res.json({ success: true, message: 'Browser closed' });
    } else {
      res.json({ success: true, message: 'Browser was not running' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 150;
      let lastHeight = document.body.scrollHeight;

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - 1000) { // Scroll to near bottom
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 1000);
        }

        lastHeight = scrollHeight;
      }, 100);
    });
  });
}

/**
 * Standardized workflow for navigating to a LinkedIn details page,
 * extracting data, and returning to the main profile.
 * 
 * @param {Object} page - Puppeteer page object
 * @param {string} profileUrl - Base profile URL (e.g., 'https://www.linkedin.com/in/williamhgates/')
 * @param {string} detailsType - Type of details page ('experience', 'education', 'certifications', etc.)
 * @param {Function} extractionFunction - Function to extract data from the details page
 * @returns {Promise<Array>} - Extracted data array
 */
async function navigateAndExtractDetailsPage(page, profileUrl, detailsType, extractionFunction) {
  console.log(`🔧 Extracting ALL ${detailsType} (navigating to details/${detailsType}/)...`);

  const profileMatch = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
  if (!profileMatch) {
    console.log(`   ⚠️ Invalid profile URL: ${profileUrl}`);
    return [];
  }

  const username = profileMatch[1];
  const detailsUrl = `https://www.linkedin.com/in/${username}/details/${detailsType}/`;

  try {
    // Navigate to details page
    console.log(`   → Navigating to: ${detailsUrl}`);
    try {
      await page.goto(detailsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navError) {
      console.log(`   ⚠️ Navigation timeout for ${detailsType}, continuing...`);
    }
    // Wait for LinkedIn list items to appear
    try {
      await page.waitForSelector('.scaffold-layout__main, main', { timeout: 10000 });
      await page.waitForSelector('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated', { timeout: 10000 });
      console.log(`   ✓ ${detailsType} list items found`);
    } catch (_) {
      console.log(`   ⚠️ No list items found for ${detailsType}, page may be empty or blocked`);
    }
    await new Promise(r => setTimeout(r, 1000));

    // Scroll to load all content
    console.log(`   → Scrolling to load all ${detailsType}...`);
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('main, [role="main"], .scaffold-finite-scroll__content');
      if (scrollContainer) {
        let unchangedCount = 0;
        let lastHeight = scrollContainer.scrollHeight;

        for (let i = 0; i < 20; i++) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          await new Promise(r => setTimeout(r, 600));

          const newHeight = scrollContainer.scrollHeight;
          if (newHeight === lastHeight) {
            unchangedCount++;
            if (unchangedCount >= 3) break;
          } else {
            unchangedCount = 0;
          }
          lastHeight = newHeight;
        }

        // Scroll back to top
        scrollContainer.scrollTop = 0;
      }
    });

    // Click all "Load more" buttons to reveal paginated content (e.g. skills)
    console.log(`   → Clicking "Load more" buttons for ${detailsType}...`);
    let totalLoadMoreClicks = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      const clicked = await page.evaluate(() => {
        // Strategy 1: Old layout — scaffold-finite-scroll__load-button
        const oldBtn = document.querySelector('.scaffold-finite-scroll__load-button');
        if (oldBtn && oldBtn.offsetParent !== null) {
          oldBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
          oldBtn.click();
          return true;
        }
        // Strategy 2: New SDUI layout — find button whose text is "Load more" or "Show more results"
        const allButtons = Array.from(document.querySelectorAll('button'));
        for (const btn of allButtons) {
          const text = (btn.textContent || '').trim().toLowerCase();
          if ((text === 'load more' || text === 'show more results') && btn.offsetParent !== null) {
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) break;
      totalLoadMoreClicks++;
      // Wait for new content to load after clicking
      await new Promise(r => setTimeout(r, 1200));
    }
    if (totalLoadMoreClicks > 0) {
      console.log(`   ✓ Clicked "Load more" ${totalLoadMoreClicks} time(s)`);
      // Extra scroll after loading more to ensure everything is rendered
      await page.evaluate(async () => {
        const scrollContainer = document.querySelector('main, [role="main"], .scaffold-finite-scroll__content');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          await new Promise(r => setTimeout(r, 500));
          scrollContainer.scrollTop = 0;
        }
      });
    }

    console.log(`   ✓ ${detailsType} details page loaded`);

    // Extract data using provided extraction function
    const extractedData = await extractionFunction(page);

    console.log(`   ✓ Extracted ${extractedData.length} ${detailsType} entries from details page`);

    // Diagnostic: if 0 results, dump page info to help debug
    if (extractedData.length === 0) {
      const diag = await page.evaluate(() => {
        const url = window.location.href;
        const title = document.title;
        const h1 = document.querySelector('h1')?.textContent?.trim() || '(none)';
        const listItems = document.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated').length;
        const mainText = (document.querySelector('main')?.innerText || '').substring(0, 500);
        const hasAuthWall = document.querySelector('.authwall-join-form') !== null;
        const bodyClasses = document.body?.className || '';

        // NEW: Dump actual DOM structure to find new selectors
        const main = document.querySelector('main');
        const allLis = main ? Array.from(main.querySelectorAll('li')).slice(0, 5) : [];
        const liInfo = allLis.map(li => ({
          classes: li.className,
          id: li.id || '',
          tag: li.tagName,
          childCount: li.children.length,
          textPreview: li.textContent?.trim()?.substring(0, 80) || ''
        }));
        // All unique class names on <li> elements inside main
        const allLiClasses = main
          ? [...new Set(Array.from(main.querySelectorAll('li')).map(li => li.className).filter(Boolean))]
          : [];
        // The direct structure of main's children
        const mainChildren = main
          ? Array.from(main.children).map(el => `${el.tagName}.${el.className?.split(' ').join('.')}`.substring(0, 120))
          : [];
        // Get the outerHTML of the first <li> inside main (truncated)
        const firstLiHtml = allLis.length > 0 ? allLis[0].outerHTML.substring(0, 500) : '(no li found)';

        return { url, title, h1, listItems, mainText, hasAuthWall, bodyClasses, liInfo, allLiClasses, mainChildren, firstLiHtml };
      });
      console.log(`   🔍 DEBUG ${detailsType} page diagnosis:`);
      console.log(`      URL: ${diag.url}`);
      console.log(`      Title: ${diag.title}`);
      console.log(`      h1: ${diag.h1}`);
      console.log(`      List items found (old selectors): ${diag.listItems}`);
      console.log(`      Auth wall: ${diag.hasAuthWall}`);
      console.log(`      Main children: ${JSON.stringify(diag.mainChildren)}`);
      console.log(`      Li classes in main: ${JSON.stringify(diag.allLiClasses)}`);
      console.log(`      First 5 lis:`, JSON.stringify(diag.liInfo, null, 2));
      console.log(`      First li HTML: ${diag.firstLiHtml}`);
      console.log(`      Main text preview: ${diag.mainText.substring(0, 300)}`);
    }

    // Navigate back to profile
    console.log('🔙 Navigating back to main profile page...');
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    return extractedData;
  } catch (error) {
    console.error(`Error extracting ${detailsType}:`, error);
    // Try to return to main profile page even on error
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 2000));
    } catch (navError) {
      console.error('Failed to return to profile:', navError);
    }
    return [];
  }
}



async function expandAllSections(page) {
  console.log('  → Simple expand (skipping "Show all" buttons)...');
  await page.evaluate(async () => {
    const expandTexts = ['See more', 'Show more', '...see more'];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));

    let clicked = 0;
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase();
      // Skip "Show all" buttons
      if (text.includes('show all')) continue;

      if (expandTexts.some(exp => text.includes(exp.toLowerCase()))) {
        try {
          btn.click();
          clicked++;
          await new Promise(r => setTimeout(r, 300));
        } catch (e) { }
      }
      if (clicked > 15) break;
    }
    console.log(`  → Clicked ${clicked} minor expand buttons`);
  });
}

// Endpoint to switch browser to headless mode
app.post('/api/switch-to-headless', async (req, res) => {
  try {
    if (!browser) {
      return res.status(400).json({
        success: false,
        error: 'No browser currently running'
      });
    }

    console.log('🔄 Switching to headless mode...');
    await launchBrowser(true);
    console.log('✅ Browser now running in headless mode');

    res.json({
      success: true,
      message: 'Browser switched to headless mode. Session preserved.'
    });

  } catch (error) {
    console.error('Error switching to headless:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 LinkedIn Scraper Backend (${BUILD_VERSION}) running on http://localhost:${PORT}`);
  console.log('📡 API endpoints ready:');
  console.log('   POST /api/start-browser - Start browser (body: {headless: true/false})');
  console.log('   GET  /api/check-login - Check if logged in');
  console.log('   GET  /api/console-logs - Get browser console output');
  console.log('   POST /api/clear-logs - Clear console logs');
  console.log('   POST /api/switch-to-headless - Switch running browser to headless mode');
  console.log('   POST /api/scrape-profile - Extract profile data');
  console.log('   POST /api/close-browser - Close browser');
});
