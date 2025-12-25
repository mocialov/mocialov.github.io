const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

let browser = null;
let page = null;

// Endpoint to start browser and login
app.post('/api/start-browser', async (req, res) => {
  try {
    console.log('🚀 Starting browser for LinkedIn login...');
    
    if (browser) {
      await browser.close();
    }

    browser = await puppeteer.launch({
      headless: false, // Show browser so user can login
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });

    page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to LinkedIn login
    await page.goto('https://www.linkedin.com/login', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    res.json({ 
      success: true, 
      message: 'Browser opened! Please login to LinkedIn in the browser window.' 
    });

  } catch (error) {
    console.error('Error starting browser:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
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

    // CRITICAL: Expand experience section to get ALL 15 experiences
    console.log('🔧 Expanding ALL experiences (clicking "Show all N experiences")...');
    const navigatedToDetails = await expandExperienceSection(page);
    
    // Extract experiences from details page FIRST (if we navigated there)
    let allExperiences = [];
    if (navigatedToDetails) {
      console.log('📊 Extracting experiences from details page...');
      allExperiences = await page.evaluate(() => {
        const experiences = [];
        const items = document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item, li.pvs-list__item--line-separated');
        
        items.forEach(item => {
          try {
            const titleElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"]');
            const companyElem = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
            const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
            const locationElem = item.querySelector('.t-14.t-normal.t-black--light:nth-child(4) span[aria-hidden="true"]');
            const descElem = item.querySelector('.pvs-list__item--with-top-padding .visually-hidden + span[aria-hidden="true"]');
            
            const exp = {
              title: titleElem?.textContent?.trim() || '',
              company: companyElem?.textContent?.trim() || '',
              dates: dateElem?.textContent?.trim() || '',
              location: locationElem?.textContent?.trim() || '',
              description: descElem?.textContent?.trim() || ''
            };
            
            if (exp.title || exp.company) {
              experiences.push(exp);
            }
          } catch (e) {
            console.error('Error extracting experience item:', e);
          }
        });
        
        console.log(`     ✅ Extracted ${experiences.length} experiences from details page`);
        return experiences;
      });
      
      // Navigate BACK to main profile page
      console.log('🔙 Navigating back to main profile page...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('📊 Extracting remaining data from main profile...');
    
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

    console.log('✅ Data extraction complete!');
    console.log('📋 Extracted:', {
      name: data.name,
      experience: data.experience.length,
      education: data.education.length,
      skills: data.skills.length
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

// Expand the experience section to show ALL experiences (not just 5)
async function expandExperienceSection(page) {
  console.log('  → Looking for "Show all experiences" link...');
  
  const result = await page.evaluate(async () => {
    const expSection = document.querySelector('#experience');
    if (!expSection) {
      return { success: false, reason: 'Experience section not found' };
    }
    
    const expContainer = expSection.closest('section');
    if (!expContainer) {
      return { success: false, reason: 'Experience container not found' };
    }
    
    // Find "Show all" link/button
    const allInteractive = Array.from(expContainer.querySelectorAll('a, button, div[role="button"], span[role="button"]'));
    console.log(`     → Found ${allInteractive.length} interactive elements`);
    
    for (const btn of allInteractive) {
      const text = (btn.textContent || '').toLowerCase().trim();
      const href = btn.getAttribute('href') || '';
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      const hasShowAll = text.includes('show all') || text.includes('see all') || ariaLabel.includes('show all');
      const hasExperience = text.includes('experience') || href.includes('experience') || ariaLabel.includes('experience');
      
      if (hasShowAll && hasExperience) {
        console.log(`     ✓ Found: "${text || ariaLabel}" (href: ${href})`);
        return { success: true, buttonText: text || ariaLabel, href: href };
      }
    }
    
    return { success: false, reason: 'Show all link not found' };
  });
  
  if (!result.success) {
    console.log(`     ⚠️ ${result.reason} - extracting only visible experiences`);
    return false;
  }
  
  // Click the link to navigate to details page
  console.log(`     → Clicking "${result.buttonText}"...`);
  
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.evaluate(() => {
        const expSection = document.querySelector('#experience');
        const expContainer = expSection?.closest('section');
        const link = expContainer?.querySelector('a[href*="details/experience"]');
        if (link) link.click();
      })
    ]);
  } catch (e) {
    console.log(`     ⚠️ Navigation error: ${e.message}`);
    return false;
  }
  
  console.log(`     ✓ Navigated to details page`);
  console.log(`     → Current URL: ${page.url()}`);
  
  // Wait longer for the page to fully load
  console.log(`     → Waiting 8 seconds for content to load...`);
  await new Promise(r => setTimeout(r, 8000));
  
  // Scroll to load all experience items
  console.log(`     → Scrolling to load all experiences...`);
  
  await page.evaluate(async () => {
    const scrollContainer = document.querySelector('.scaffold-finite-scroll__content') || document.body;
    
    const countItems = () => document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item, li.pvs-list__item--line-separated').length;
    
    let lastCount = 0;
    let unchangedCount = 0;
    
    for (let i = 0; i < 30; i++) {
      const before = countItems();
      
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      
      await new Promise(r => setTimeout(r, 800));
      
      const after = countItems();
      
      if (after > before) {
        console.log(`     → Scroll ${i + 1}: ${after} items`);
        unchangedCount = 0;
      } else {
        unchangedCount++;
        if (unchangedCount >= 4) {
          console.log(`     → Scroll ${i + 1}: ${after} items (done loading)`);
          break;
        }
      }
    }
    
    const finalCount = countItems();
    console.log(`     ✅ Total experiences loaded: ${finalCount}`);
  });
  
  await new Promise(r => setTimeout(r, 2000));
  return true;
}



async function expandAllSections(page) {
  console.log('  → Simple expand (skipping "Show all" buttons)...');
  await page.evaluate(async () => {
    const expandTexts = ['See more', 'Show more', '...see more'];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    
    let clicked = 0;
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase();
      // Skip "Show all" to not interfere with expandExperienceSection
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

app.listen(PORT, () => {
  console.log('🚀 LinkedIn Scraper Backend running on http://localhost:' + PORT);
  console.log('📡 API endpoints ready:');
  console.log('   POST /api/start-browser - Start browser for login');
  console.log('   GET  /api/check-login - Check if logged in');
  console.log('   POST /api/scrape-profile - Extract profile data');
  console.log('   POST /api/close-browser - Close browser');
});
