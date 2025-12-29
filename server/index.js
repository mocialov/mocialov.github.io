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

// Endpoint to start browser and login
app.post('/api/start-browser', async (req, res) => {
  try {
    const { headless = false } = req.body; // Allow headless mode via request body

    console.log(`🚀 Starting browser ${headless ? '(headless)' : '(visible)'}...`);

    if (browser) {
      await browser.close();
    }

    browser = await puppeteer.launch({
      headless: headless, // Can be controlled via request
      userDataDir: USER_DATA_DIR, // Persist session
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

    // Capture browser console output
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const logEntry = { type, text, timestamp: new Date().toISOString() };
      consoleLogs.push(logEntry);
      console.log(`[Browser ${type.toUpperCase()}]:`, text);
    });

    // capture page errors
    page.on('pageerror', error => {
      const logEntry = { type: 'error', text: error.message, timestamp: new Date().toISOString() };
      consoleLogs.push(logEntry);
      console.log('[Browser ERROR]:', error.message);
    });

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to LinkedIn login (more lenient timeout handling)
    try {
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, but page may have loaded. Continuing...');
      // Continue anyway - page might be usable even if not fully loaded
    }

    res.json({
      success: true,
      headless: headless,
      message: headless
        ? 'Browser started in headless mode. Session will be reused if already logged in.'
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

    const profileUrl = req.body.profileUrl || 'https://www.linkedin.com/in/mocialov/';
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

    const profileUrl = req.body.profileUrl || 'https://www.linkedin.com/in/mocialov/';

    // Navigate to profile with extended timeout and different wait strategy
    console.log('🔍 Navigating to:', profileUrl);
    try {
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 120000 // 2 minutes
      });
    } catch (navError) {
      console.log('⚠️ Navigation timeout, but page may have loaded. Continuing...');
    }

    // Wait a bit for dynamic content
    await new Promise(r => setTimeout(r, 3000));

    // Check if we're on the right page
    const currentUrl = page.url();
    if (currentUrl.includes('authwall') || currentUrl.includes('login')) {
      return res.status(401).json({
        success: false,
        error: 'Not logged in. Please login first in the browser window.'
      });
    }

    // Wait for profile to load
    try {
      await page.waitForSelector('h1', { timeout: 15000 });
    } catch (e) {
      console.log('⚠️ Could not find h1, but continuing...');
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
    if (allSkills && allSkills.length > 0) {
      data.skills = allSkills;
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
 * @param {string} profileUrl - Base profile URL (e.g., 'https://www.linkedin.com/in/mocialov/')
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
    await page.goto(detailsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

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

    console.log(`   ✓ ${detailsType} details page loaded`);

    // Extract data using provided extraction function
    const extractedData = await extractionFunction(page);

    console.log(`   ✓ Extracted ${extractedData.length} ${detailsType} entries from details page`);

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

    // Close current browser
    await browser.close();
    browser = null;
    page = null;

    // Relaunch in headless mode with same user data
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: USER_DATA_DIR, // Reuse same session
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });

    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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
