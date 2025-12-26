#!/usr/bin/env node

/**
 * Automated LinkedIn Profile Data Extractor
 * 
 * This script:
 * 1. Opens a browser window
 * 2. Navigates to LinkedIn
 * 3. Waits for you to log in manually
 * 4. Navigates to your profile
 * 5. Automatically expands all sections and extracts data
 * 6. Saves to linkedin-full-data.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.linkedin.com/in/mocialov/';
const LOGIN_URL = 'https://www.linkedin.com/login';
const DATA_OUTPUT_PATH = path.join(__dirname, 'linkedin-full-data.json');

async function extractLinkedInData() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 LinkedIn Profile Data Extractor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let browser;
  
  try {
    // Launch browser in non-headless mode so user can see and interact
    console.log('📂 Opening browser...\n');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to LinkedIn login
    console.log('🌐 Navigating to LinkedIn...\n');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });

    // Wait for user to log in
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 PLEASE LOG IN TO LINKEDIN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⏳ Waiting for you to complete login...');
    console.log('   (The script will continue automatically after login)\n');

    // Wait for navigation to LinkedIn feed (indicates successful login)
    try {
      await page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 120000 // 2 minutes for user to log in
      });
      console.log('✅ Login detected!\n');
    } catch (error) {
      console.log('⚠️  Login timeout or navigation issue');
      console.log('   Attempting to continue anyway...\n');
    }

    // Navigate to profile
    console.log(`🔗 Navigating to profile: ${PROFILE_URL}\n`);
    await page.goto(PROFILE_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Wait a bit for page to fully render
    await page.waitForTimeout(3000);

    console.log('📊 Starting data extraction...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('This will take 20-30 seconds');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Inject and run the extraction script
    const data = await page.evaluate(async () => {
      // Auto-scroll function
      async function autoScroll() {
        console.log('📜 Scrolling through profile...');
        return new Promise((resolve) => {
          let totalHeight = 0;
          let lastHeight = 0;
          const distance = 150;
          
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            const currentHeight = document.body.scrollHeight;
            if (totalHeight >= currentHeight && currentHeight === lastHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              setTimeout(resolve, 1500);
            }
            lastHeight = currentHeight;
          }, 100);
        });
      }

      // Click all expand buttons
      async function expandAllSections() {
        console.log('🔍 Expanding all sections...');
        const expandTexts = [
          'Show all', 'See more', 'Show more', 
          '...see more', 'see all', 'View more',
          'Afficher tout', 'Mehr anzeigen'
        ];
        
        let clicked = 0;
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        
        for (const btn of buttons) {
          const text = btn.textContent.toLowerCase();
          if (expandTexts.some(exp => text.includes(exp.toLowerCase()))) {
            try {
              btn.click();
              clicked++;
              await new Promise(r => setTimeout(r, 400));
            } catch(e) {
              // Ignore click errors
            }
          }
        }
        console.log(`   ✓ Clicked ${clicked} expand buttons`);
      }

      // Specifically expand experience section
      async function expandExperienceSection() {
        console.log('🔧 Expanding Experience section...');
        
        const expSection = document.querySelector('#experience');
        if (!expSection) {
          console.log('   ⚠️  Experience section not found');
          return;
        }
        
        const expContainer = expSection.closest('section');
        if (!expContainer) return;
        
        // Click "Show all experiences"
        const allButtons = expContainer.querySelectorAll('a, button');
        for (const btn of allButtons) {
          const text = btn.textContent.toLowerCase().trim();
          const href = btn.getAttribute('href') || '';
          
          if ((text.includes('show all') || text.includes('see all')) && 
              (text.includes('experience') || href.includes('experience'))) {
            try {
              console.log(`   → Clicking: "${btn.textContent.trim()}"`);
              btn.click();
              await new Promise(r => setTimeout(r, 2000));
              break;
            } catch(e) {
              // Ignore
            }
          }
        }
        
        // Scroll within modal if it exists
        await new Promise(r => setTimeout(r, 1000));
        const modal = document.querySelector('[role="dialog"], .artdeco-modal');
        if (modal) {
          console.log('   → Scrolling within modal...');
          const scrollContainer = modal.querySelector('.artdeco-modal__content, [role="dialog"] > div');
          if (scrollContainer) {
            let lastHeight = 0;
            for (let i = 0; i < 10; i++) {
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
              await new Promise(r => setTimeout(r, 300));
              if (scrollContainer.scrollHeight === lastHeight) break;
              lastHeight = scrollContainer.scrollHeight;
            }
          }
        }
        
        // Expand nested roles
        const containers = [expContainer];
        if (modal) containers.push(modal);
        
        let expandedCount = 0;
        for (const container of containers) {
          const items = container.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
          
          for (const item of items) {
            const expandButtons = item.querySelectorAll('button, [role="button"]');
            for (const btn of expandButtons) {
              const ariaExpanded = btn.getAttribute('aria-expanded');
              
              if (ariaExpanded === 'false') {
                try {
                  btn.click();
                  expandedCount++;
                  await new Promise(r => setTimeout(r, 600));
                } catch(e) {
                  // Ignore
                }
              }
            }
          }
        }
        console.log(`   ✓ Expanded ${expandedCount} nested entries`);
      }

      // Execute expansion
      await autoScroll();
      await expandAllSections();
      await expandExperienceSection();
      await new Promise(r => setTimeout(r, 1000));
      await autoScroll();

      console.log('📊 Extracting data from DOM...\n');

      // Initialize data structure
      const data = {
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

      // Extract profile image
      const profileImg = document.querySelector('img.pv-top-card-profile-picture__image, button.pv-top-card-profile-picture img, img[title*="Profile"]');
      if (profileImg) {
        data.image = profileImg.src || profileImg.getAttribute('data-delayed-url') || '';
      }

      // Extract name
      const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1.inline.t-24',
        '.pv-text-details__left-panel h1',
        'div.mt2 h1'
      ];
      for (const selector of nameSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          data.name = elem.textContent.trim();
          break;
        }
      }

      // Extract headline
      const headlineSelectors = [
        '.text-body-medium.break-words',
        'div.text-body-medium',
        '.pv-text-details__left-panel .text-body-medium'
      ];
      for (const selector of headlineSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
          data.headline = elem.textContent.trim();
          break;
        }
      }

      // Extract location
      const locationSelectors = [
        '.text-body-small.inline.t-black--light.break-words',
        'span.text-body-small',
        '.pv-text-details__left-panel span.text-body-small'
      ];
      for (const selector of locationSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim() && !elem.textContent.includes('Contact info')) {
          data.location = elem.textContent.trim();
          break;
        }
      }

      // Extract About
      const aboutSection = document.querySelector('#about');
      if (aboutSection) {
        const aboutContainer = aboutSection.closest('section');
        if (aboutContainer) {
          const aboutText = aboutContainer.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more, .display-flex.full-width');
          if (aboutText) {
            data.about = aboutText.textContent.trim().replace(/\s+/g, ' ');
          }
        }
      }

      // Extract Experience
      console.log('🏢 Extracting experiences...');
      const modal = document.querySelector('[role="dialog"], .artdeco-modal');
      const expSection = document.querySelector('#experience');
      
      const experienceContainers = [];
      if (modal && modal.querySelector('[id*="experience"], [class*="experience"]')) {
        experienceContainers.push(modal);
      }
      if (expSection) {
        const expContainer = expSection.closest('section');
        if (expContainer) {
          experienceContainers.push(expContainer);
        }
      }
      
      const seenExperiences = new Set();
      
      for (const container of experienceContainers) {
        const items = container.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
        
        items.forEach((item) => {
          try {
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
              .map(s => s.textContent.trim())
              .filter(t => t && t.length > 0);
            
            const titleElem = item.querySelector('.mr1.t-bold span, .t-bold span, .pvs-entity__path span[aria-hidden="true"]');
            const companyElem = item.querySelector('.t-14.t-normal span, .t-14 span, .pvs-entity__caption-wrapper span');
            
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
            
            const expKey = `${experience.title}|${experience.company}|${experience.duration}`.toLowerCase();
            
            // Filter out "who viewed me" and "who your viewers also viewed" entries
            const isViewerData = 
              experience.title.startsWith('Someone at') ||
              experience.company.startsWith('Someone at') ||
              experience.title.includes('…') || // Truncated viewer entries
              (experience.title.match(/\bat\b/i) && !experience.company && !experience.duration) || // "Job Title at Company" with no separate company/date
              (!experience.duration && !experience.company && experience.title); // Only title, no dates or company (viewer data pattern)
            
            if ((experience.title || experience.company) && !seenExperiences.has(expKey) && !isViewerData) {
              data.experience.push(experience);
              seenExperiences.add(expKey);
            }
          } catch (e) {
            console.log('Error parsing experience:', e.message);
          }
        });
      }

      console.log(`   ✓ Extracted ${data.experience.length} experiences`);

      // Expand and extract Education
      async function expandEducationSection() {
        console.log('🔧 Expanding Education section...');
        
        // Get current profile URL to construct education details URL
        const currentUrl = window.location.href;
        const profileMatch = currentUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
        
        if (!profileMatch) {
          console.log('   ⚠️  Could not determine profile username');
          return false;
        }
        
        const username = profileMatch[1];
        const educationDetailsUrl = `https://www.linkedin.com/in/${username}/details/education/`;
        
        console.log(`   → Navigating to: ${educationDetailsUrl}`);
        window.location.href = educationDetailsUrl;
        return true;
      }
      
      // Try to expand education section
      const navigatedToEducation = await expandEducationSection();
      
      if (navigatedToEducation) {
        // Wait for navigation and page load
        await new Promise(r => setTimeout(r, 5000));
        
        // Scroll to load all education entries
        console.log('   → Scrolling to load all education...');
        const mainContainer = document.querySelector('main, [role="main"], .scaffold-finite-scroll__content');
        if (mainContainer) {
          let unchangedCount = 0;
          let lastHeight = mainContainer.scrollHeight;
          
          for (let i = 0; i < 20; i++) {
            mainContainer.scrollTop = mainContainer.scrollHeight;
            await new Promise(r => setTimeout(r, 600));
            
            const newHeight = mainContainer.scrollHeight;
            if (newHeight === lastHeight) {
              unchangedCount++;
              if (unchangedCount >= 3) break;
            } else {
              unchangedCount = 0;
            }
            lastHeight = newHeight;
          }
          
          mainContainer.scrollTop = 0;
        }
        
        console.log('   ✓ Finished loading education details');
      }

      // Extract Education
      const eduSection = document.querySelector('#education');
      if (eduSection) {
        const eduContainer = eduSection.closest('section');
        if (eduContainer) {
          const items = eduContainer.querySelectorAll('li.artdeco-list__item, .pvs-list__item, li.pvs-list__paged-list-item');
          
          console.log(`   → Found ${items.length} education items`);
          
          items.forEach((item) => {
            try {
              // Try structured extraction first (for details page)
              const schoolElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"]');
              const degreeElem = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
              const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
              const descElem = item.querySelector('.pvs-list__item--with-top-padding .visually-hidden + span[aria-hidden="true"]');
              
              // Fallback: Get all spans
              const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);
              
              const education = {
                school: schoolElem?.textContent?.trim() || allSpans[0] || '',
                degree: degreeElem?.textContent?.trim() || allSpans[1] || '',
                field: allSpans[2] || '',
                duration: '',
                description: descElem?.textContent?.trim() || ''
              };
              
              // Find duration (year pattern)
              const durationSpan = dateElem?.textContent?.trim() || allSpans.find(s => /\d{4}/.test(s));
              if (durationSpan) education.duration = durationSpan;
              
              // Try alternative description selector
              if (!education.description) {
                const descElemAlt = item.querySelector('.inline-show-more-text');
                if (descElemAlt) {
                  education.description = descElemAlt.textContent.trim();
                }
              }
              
              if (education.school) {
                data.education.push(education);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          });
        }
      }

      // Extract Skills
      const skillsSection = document.querySelector('#skills');
      if (skillsSection) {
        const skillsContainer = skillsSection.closest('section');
        if (skillsContainer) {
          const skillElems = skillsContainer.querySelectorAll('.mr1.t-bold span[aria-hidden="true"], .artdeco-list__item .t-bold span');
          
          skillElems.forEach(elem => {
            const skill = elem.textContent.trim();
            if (skill && !skill.toLowerCase().includes('endorsement') && skill.length > 1) {
              data.skills.push(skill);
            }
          });
          
          data.skills = [...new Set(data.skills)];
        }
      }

      // Extract Certifications
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
                  date: allSpans.find(s => /\d{4}|Issued/.test(s)) || '',
                  credentialId: '',
                  url: ''
                };
                
                const link = item.querySelector('a[href*="credential"]');
                if (link) cert.url = link.href;
                
                if (cert.name) {
                  data.certifications.push(cert);
                }
              }
            } catch (e) {
              // Ignore
            }
          });
        }
      }

      console.log('\n✅ Extraction complete!');
      return data;
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Data Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Name: ${data.name || 'Not found'}`);
    console.log(`   Headline: ${data.headline ? '✓' : 'Not found'}`);
    console.log(`   Location: ${data.location || 'Not found'}`);
    console.log(`   About: ${data.about ? `✓ (${data.about.length} chars)` : 'Not found'}`);
    console.log(`   Experience: ${data.experience.length} entries`);
    console.log(`   Education: ${data.education.length} entries`);
    console.log(`   Skills: ${data.skills.length} skills`);
    console.log(`   Certifications: ${data.certifications.length} certs`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (data.experience.length > 0) {
      console.log('📌 Sample Experience:');
      console.log(JSON.stringify(data.experience[0], null, 2));
      console.log('');
    }

    // Save to file
    fs.writeFileSync(DATA_OUTPUT_PATH, JSON.stringify(data, null, 2));
    console.log(`💾 Data saved to: ${DATA_OUTPUT_PATH}\n`);

    console.log('✅ All done! You can close the browser now.');
    console.log('\n📝 Next steps:');
    console.log('   1. Review the data in linkedin-full-data.json');
    console.log('   2. Update server/index.js with this data if needed\n');

    // Keep browser open for 5 seconds so user can see final state
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:', error.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed.\n');
    }
  }
}

// Run the extractor
extractLinkedInData().catch(console.error);
