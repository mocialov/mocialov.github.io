const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

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
    
    // Capture page errors
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
    
    // Extract experiences from details/experience page
    allExperiences = await navigateAndExtractDetailsPage(
      page, 
      profileUrl, 
      'experience', 
      extractExperienceData
    );
    
    // Extract education from details/education page
    allEducation = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'education',
      extractEducationData
    );
    
    // Extract certifications from details/certifications page
    allCertifications = await navigateAndExtractDetailsPage(
      page,
      profileUrl,
      'certifications',
      extractCertificationData
    );

    console.log('📊 Extracting supplementary data from main profile...');
    
    // Extract all data
    const data = await page.evaluate(() => {
      const extractedData = {
        linkedinUrl: window.location.href.split('?')[0],
        name: '',
        headline: '',
        location: '',
        image: '',
        about: '',
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
        volunteer: [],
        languages: [],
        timestamp: new Date().toISOString()
      };

      // Profile image
      const profileImg = document.querySelector('img.pv-top-card-profile-picture__image, button.pv-top-card-profile-picture img, img.pv-top-card-profile-picture__image--show');
      if (profileImg) {
        extractedData.image = profileImg.src || profileImg.getAttribute('data-delayed-url') || '';
      }

      // Name
      const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1.inline.t-24',
        '.pv-text-details__left-panel h1',
        'div.mt2 h1'
      ];
      for (const selector of nameSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          extractedData.name = elem.textContent.trim();
          break;
        }
      }

      // Headline
      const headlineSelectors = [
        '.text-body-medium.break-words',
        'div.text-body-medium',
        '.pv-text-details__left-panel .text-body-medium'
      ];
      for (const selector of headlineSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          extractedData.headline = elem.textContent.trim();
          break;
        }
      }

      // Location
      const locationSelectors = [
        '.text-body-small.inline.t-black--light.break-words',
        'span.text-body-small',
        '.pv-text-details__left-panel span.text-body-small'
      ];
      for (const selector of locationSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim() && !elem.textContent.includes('Contact info')) {
          extractedData.location = elem.textContent.trim();
          break;
        }
      }

      // About section
      const aboutSection = document.querySelector('#about');
      if (aboutSection) {
        const aboutContainer = aboutSection.closest('section');
        if (aboutContainer) {
          const aboutText = aboutContainer.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more, .display-flex.full-width');
          if (aboutText) {
            extractedData.about = aboutText.textContent.trim().replace(/\s+/g, ' ');
          }
        }
      }

      // Experience - improved to handle nested positions at the same company
      const expSection = document.querySelector('#experience');
      if (expSection) {
        const expContainer = expSection.closest('section');
        if (expContainer) {
          const items = expContainer.querySelectorAll('li.artdeco-list__item');
          
          items.forEach((item) => {
            try {
              // Check if this is a grouped experience (multiple positions at same company)
              const groupedRoles = item.querySelectorAll('ul.pvs-list li.pvs-list__paged-list-item');
              
              if (groupedRoles.length > 0) {
                // Multiple positions at same company
                const companyName = item.querySelector('.t-bold span')?.textContent?.trim() || '';
                const totalDuration = item.querySelector('.t-14.t-normal span')?.textContent?.trim() || '';
                
                groupedRoles.forEach(role => {
                  try {
                    const roleSpans = Array.from(role.querySelectorAll('span[aria-hidden="true"]'))
                      .map(s => s.textContent.trim())
                      .filter(t => t && t.length > 0);
                    
                    const experience = {
                      title: roleSpans[0] || '',
                      company: companyName,
                      duration: roleSpans.find(s => /\d{4}|Present|yr|mo|year|month/i.test(s)) || '',
                      location: roleSpans.find(s => s.includes(',') && !/\d{4}/.test(s) && s.length < 100) || '',
                      description: ''
                    };
                    
                    const descElem = role.querySelector('.inline-show-more-text, .pvs-list__outer-container');
                    if (descElem) {
                      experience.description = descElem.textContent.trim().replace(/\s+/g, ' ');
                    }
                    
                    if (experience.title) {
                      extractedData.experience.push(experience);
                    }
                  } catch (e) {
                    console.error('Error parsing grouped experience:', e);
                  }
                });
              } else {
                // Single position
                const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                  .map(s => s.textContent.trim())
                  .filter(t => t && t.length > 0);
                
                const titleElem = item.querySelector('.mr1.t-bold span, .t-bold span');
                const companyElem = item.querySelector('.t-14.t-normal span, .t-14 span');
                
                const experience = {
                  title: titleElem?.textContent?.trim() || allSpans[0] || '',
                  company: companyElem?.textContent?.trim() || allSpans[1] || '',
                  duration: '',
                  location: '',
                  description: ''
                };
                
                const durationPattern = /\d{4}|Present|yr|mo|year|month/i;
                const durationSpan = allSpans.find(s => durationPattern.test(s));
                if (durationSpan) experience.duration = durationSpan;
                
                const locationSpan = allSpans.find(s => 
                  s.includes(',') && 
                  !/\d{4}/.test(s) && 
                  s.length < 100 &&
                  s !== experience.title &&
                  s !== experience.company
                );
                if (locationSpan) experience.location = locationSpan;
                
                const descElem = item.querySelector('.inline-show-more-text, .t-14.t-normal.t-black, .pvs-list__outer-container');
                if (descElem) {
                  experience.description = descElem.textContent.trim().replace(/\s+/g, ' ');
                }
                
                if (experience.title || experience.company) {
                  extractedData.experience.push(experience);
                }
              }
            } catch (e) {
              console.error('Error parsing experience:', e);
            }
          });
        }
      }

      // Education - improved extraction
      const eduSection = document.querySelector('#education');
      if (eduSection) {
        const eduContainer = eduSection.closest('section');
        if (eduContainer) {
          const items = eduContainer.querySelectorAll('li.artdeco-list__item');
          
          items.forEach((item) => {
            try {
              const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0 && !t.includes('·')); // Filter out separator dots
              
              // Try to get school name from bold text first
              const schoolElem = item.querySelector('.t-bold span, .mr1.t-bold span');
              const schoolName = schoolElem?.textContent?.trim() || allSpans[0] || '';
              
              const education = {
                school: schoolName,
                degree: '',
                field: '',
                duration: '',
                grade: '',
                activities: '',
                description: ''
              };
              
              // Try to find degree and field
              if (allSpans.length > 1) {
                // Usually: [School, Degree, Field, Duration, ...]
                const degreeField = allSpans[1];
                if (degreeField && degreeField.includes(',')) {
                  const parts = degreeField.split(',').map(p => p.trim());
                  education.degree = parts[0] || '';
                  education.field = parts[1] || '';
                } else {
                  education.degree = degreeField || '';
                  if (allSpans[2] && !allSpans[2].match(/\d{4}/)) {
                    education.field = allSpans[2];
                  }
                }
              }
              
              // Find duration (contains years)
              const durationSpan = allSpans.find(s => /\d{4}/.test(s) || s.match(/\d{4}\s*-\s*\d{4}/));
              if (durationSpan) education.duration = durationSpan;
              
              // Find grade/GPA
              const gradeSpan = allSpans.find(s => 
                s.toLowerCase().includes('grade') || 
                s.toLowerCase().includes('gpa') ||
                s.match(/\d\.\d/)
              );
              if (gradeSpan) education.grade = gradeSpan;
              
              // Get full description/activities
              const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container');
              if (descElem) {
                const fullText = descElem.textContent.trim().replace(/\s+/g, ' ');
                // Try to separate activities and description
                if (fullText.toLowerCase().includes('activities')) {
                  const parts = fullText.split(/activities and societies:/i);
                  if (parts.length > 1) {
                    education.activities = parts[1].trim();
                    education.description = parts[0].trim();
                  } else {
                    education.description = fullText;
                  }
                } else {
                  education.description = fullText;
                }
              }
              
              if (education.school) {
                extractedData.education.push(education);
              }
            } catch (e) {
              console.error('Error parsing education:', e);
            }
          });
        }
      }

      // Skills
      const skillsSection = document.querySelector('#skills');
      if (skillsSection) {
        const skillsContainer = skillsSection.closest('section');
        if (skillsContainer) {
          const skillElems = skillsContainer.querySelectorAll('.mr1.t-bold span[aria-hidden="true"], .artdeco-list__item .t-bold span');
          
          skillElems.forEach(elem => {
            const skill = elem.textContent.trim();
            if (skill && !skill.toLowerCase().includes('endorsement') && skill.length > 1) {
              extractedData.skills.push(skill);
            }
          });
          
          extractedData.skills = [...new Set(extractedData.skills)];
        }
      }

      // Certifications
      const certsSection = document.querySelector('#licenses_and_certifications');
      if (certsSection) {
        const certsContainer = certsSection.closest('section');
        if (certsContainer) {
          const items = certsContainer.querySelectorAll('li.artdeco-list__item');
          
          items.forEach((item) => {
            try {
              const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);
              
              if (allSpans.length > 0) {
                const cert = {
                  name: allSpans[0] || '',
                  issuer: allSpans[1] || '',
                  date: allSpans.find(s => /\d{4}|Issued/.test(s)) || ''
                };
                
                const link = item.querySelector('a[href*="credential"]');
                if (link) cert.url = link.href;
                
                if (cert.name) {
                  extractedData.certifications.push(cert);
                }
              }
            } catch (e) {
              console.error('Error parsing certification:', e);
            }
          });
        }
      }

      return extractedData;
    });

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

    console.log('✅ Data extraction complete!');
    console.log('📋 Extracted:', {
      name: data.name,
      experience: data.experience.length,
      education: data.education.length,
      skills: data.skills.length,
      certifications: data.certifications.length
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

/**
 * Extract experience data from LinkedIn details/experience page
 */
async function extractExperienceData(page) {
  return await page.evaluate(() => {
    const experiences = [];
    const mainContent = document.querySelector('main') || document.body;
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');
    
    items.forEach(item => {
      try {
        // Get all visible text spans
        const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.textContent.trim())
          .filter(t => t && t.length > 0 && !t.includes('Someone at'));
        
        if (allSpans.length < 2) return; // Need at least title and company
        
        // First span is usually title, second is company with employment type
        const title = allSpans[0] || '';
        const companyLine = allSpans[1] || '';
        
        // Find dates (contains year or "Present")
        const dates = allSpans.find(s => /\d{4}|Present/i.test(s) && !s.includes('Issued')) || '';
        
        // Find location (has comma, no years, not too long)
        const location = allSpans.find(s => 
          s.includes(',') && 
          !/\d{4}/.test(s) && 
          s.length < 100 &&
          s !== title &&
          s !== companyLine
        ) || '';
        
        // Description is usually in a container with specific class or the longest non-metadata text
        let description = '';
        const descContainer = item.querySelector('.inline-show-more-text, .pvs-list__outer-container');
        if (descContainer) {
          description = descContainer.textContent.trim().replace(/\s+/g, ' ');
        } else {
          // Look for longer text that's not metadata
          const longText = allSpans.find(s => 
            s.length > 50 && 
            s !== title && 
            s !== companyLine && 
            s !== dates && 
            s !== location
          );
          if (longText) description = longText;
        }
        
        // Filter out viewer data
        const isViewerData = 
          title.startsWith('Someone at') ||
          companyLine.startsWith('Someone at') ||
          title.includes('…') ||
          (!dates && !companyLine);
        
        if (!isViewerData && title) {
          experiences.push({
            title,
            company: companyLine,
            dates,
            location,
            description
          });
        }
      } catch (e) {
        console.error('Error extracting experience item:', e);
      }
    });
    
    console.log(`     ✅ Extracted ${experiences.length} experiences from details page`);
    return experiences;
  });
}

/**
 * Extract education data from LinkedIn details/education page
 */
async function extractEducationData(page) {
  return await page.evaluate(() => {
    const education = [];
    
    // Only select items from the main content area, not from "Who viewed" sidebar
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    const items = mainContent.querySelectorAll('.pvs-list__item--line-separated, li.pvs-list__paged-list-item');
    
    items.forEach((item) => {
      try {
        const schoolElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"]');
        const degreeElem = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
        const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        
        const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.textContent.trim())
          .filter(t => t && t.length > 0);
        
        const edu = {
          school: schoolElem?.textContent?.trim() || allSpans[0] || '',
          degree: degreeElem?.textContent?.trim() || allSpans[1] || '',
          field: allSpans[2] || '',
          duration: dateElem?.textContent?.trim() || allSpans.find(s => /\d{4}/.test(s)) || '',
          description: ''
        };
        
        // Filter out viewer data (same logic as experiences)
        const isViewerData = 
          edu.school.startsWith('Someone at') ||
          edu.degree.startsWith('Someone at') ||
          edu.school.includes('…') ||
          edu.school.includes('...') ||
          (edu.school.match(/\bat\b/i) && !edu.degree && !edu.duration) ||
          (!edu.duration && !edu.degree && edu.school);
        
        if (edu.school && !isViewerData) {
          education.push(edu);
        }
      } catch (e) {
        // Ignore
      }
    });
    
    return education;
  });
}

/**
 * Extract certification data from LinkedIn details/certifications page
 */
async function extractCertificationData(page) {
  return await page.evaluate(() => {
    const certifications = [];
    const items = document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item, li.pvs-list__item--line-separated');
    
    items.forEach((item) => {
      try {
        const nameElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"]') ||
                         item.querySelector('span.t-bold span[aria-hidden="true"]') ||
                         item.querySelector('.pvs-entity__path span[aria-hidden="true"]');
        const issuerElem = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                          item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
        const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        
        const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.textContent.trim())
          .filter(t => t && t.length > 0 && t.length < 500);
        
        const cert = {
          name: nameElem?.textContent?.trim() || allSpans[0] || '',
          issuer: issuerElem?.textContent?.trim() || allSpans[1] || '',
          date: '',
          credentialId: '',
          url: ''
        };
        
        const dateSpan = dateElem?.textContent?.trim() || allSpans.find(s => /\d{4}|Issued|Expires/i.test(s));
        if (dateSpan) cert.date = dateSpan;
        
        const credentialSpan = allSpans.find(s => /Credential ID|ID:/i.test(s));
        if (credentialSpan) {
          cert.credentialId = credentialSpan.replace(/Credential ID:?/i, '').trim();
        }
        
        const link = item.querySelector('a[href*="credential"], a[href*="credly"], a[href*="certificate"]');
        if (link) cert.url = link.href;
        
        if (cert.name || cert.issuer) {
          certifications.push(cert);
        }
      } catch (e) {
        // Ignore
      }
    });
    
    return certifications;
  });
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
        } catch (e) {}
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
