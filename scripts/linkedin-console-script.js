
// LinkedIn Data Extractor - Enhanced Version
// Run this in your browser console while logged in to LinkedIn
// Navigate to your profile: https://www.linkedin.com/in/mocialov/
(async function() {
  console.log('🚀 Starting enhanced LinkedIn data extraction...');
  console.log('⏳ This will take 15-20 seconds to ensure all content is loaded...\n');
  
  // Auto-scroll function with better coverage
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
          window.scrollTo(0, 0); // Scroll back to top
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
      'Afficher tout', 'Mehr anzeigen' // multilingual support
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
          console.log('Could not click button:', e.message);
        }
      }
    }
    console.log(`   ✓ Clicked ${clicked} expand buttons`);
  }
  
  // Specifically expand all experience entries (including nested roles at same company)
  async function expandExperienceSection() {
    console.log('🔧 Expanding Experience section entries...');
    
    const expSection = document.querySelector('#experience');
    if (!expSection) {
      console.log('   ⚠️  Experience section not found');
      return;
    }
    
    const expContainer = expSection.closest('section');
    if (!expContainer) {
      console.log('   ⚠️  Experience container not found');
      return;
    }
    
    // Strategy 1: Find and click "Show all X experiences" button
    console.log('   → Looking for "Show all experiences" button...');
    let foundShowAll = false;
    
    // AGGRESSIVE SEARCH: Try all possible selectors and text patterns
    const allInteractive = expContainer.querySelectorAll('a, button, div[role="button"], span[role="button"]');
    
    for (const btn of allInteractive) {
      const text = btn.textContent.toLowerCase().trim();
      const href = btn.getAttribute('href') || '';
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Match any of these patterns:
      // - "Show all N experiences"
      // - "See all experiences" 
      // - Link to details/experience
      const hasShowAll = text.includes('show all') || text.includes('see all') || ariaLabel.includes('show all');
      const hasExperience = text.includes('experience') || href.includes('experience') || ariaLabel.includes('experience');
      const isDetailsLink = href.includes('details/experience');
      
      if ((hasShowAll && hasExperience) || isDetailsLink) {
        try {
          console.log(`   → Clicking: "${btn.textContent.trim()}" (href: ${href})`);
          btn.click();
          foundShowAll = true;
          await new Promise(r => setTimeout(r, 3000)); // Wait for modal/navigation
          break;
        } catch(e) {
          console.log('   Could not click:', e.message);
        }
      }
    }
    
    if (foundShowAll) {
      console.log('   ✓ Clicked show all button');
      
      // Wait for modal or navigation to complete
      await new Promise(r => setTimeout(r, 2000));
      
      // Check if modal opened
      const modal = document.querySelector('[role="dialog"], .artdeco-modal, div[data-test-modal]');
      if (modal) {
        console.log('   → Experience modal detected, scrolling to load all entries...');
        const scrollContainer = modal.querySelector('.artdeco-modal__content, .scaffold-finite-scroll__content, [role="dialog"] > div');
        
        if (scrollContainer) {
          let unchangedCount = 0;
          
          // Scroll aggressively until no new content loads
          for (let i = 0; i < 20; i++) {
            const prevHeight = scrollContainer.scrollHeight;
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            await new Promise(r => setTimeout(r, 600));
            
            if (scrollContainer.scrollHeight === prevHeight) {
              unchangedCount++;
              if (unchangedCount >= 3) {
                console.log(`   ✓ Reached bottom after ${i + 1} scroll attempts`);
                break;
              }
            } else {
              unchangedCount = 0;
            }
          }
          
          // Scroll back to top
          scrollContainer.scrollTop = 0;
          await new Promise(r => setTimeout(r, 500));
        }
      } else {
        console.log('   → No modal detected, may have navigated to details page');
      }
    } else {
      console.log('   ⚠️  "Show all experiences" button not found - will extract visible items only');
    }
    
    // Strategy 2: Expand individual company entries (multiple roles at same company)
    console.log('   → Looking for nested role expand buttons...');
    
    // Look in both the main container and any open modal
    const containers = [expContainer];
    const modal = document.querySelector('[role="dialog"], .artdeco-modal');
    if (modal) containers.push(modal);
    
    let expandedCount = 0;
    for (const container of containers) {
      const items = container.querySelectorAll('li.artdeco-list__item, li[class*="profile-section"]');
      console.log(`   Found ${items.length} experience items in container`);
      
      for (const item of items) {
        // Look for expand buttons within each experience item
        const expandButtons = item.querySelectorAll('button, [role="button"]');
        for (const btn of expandButtons) {
          const text = btn.textContent.toLowerCase();
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          const ariaExpanded = btn.getAttribute('aria-expanded');
          
          // Look for buttons that expand to show more roles/positions
          if (ariaExpanded === 'false' || 
              (text.includes('show') && (text.includes('role') || text.includes('position') || text.includes('more'))) ||
              (ariaLabel.includes('show') && (ariaLabel.includes('role') || ariaLabel.includes('position') || ariaLabel.includes('more')))) {
            try {
              console.log(`   → Expanding: "${btn.textContent.trim() || ariaLabel}"`);
              btn.click();
              expandedCount++;
              await new Promise(r => setTimeout(r, 600));
            } catch(e) {
              console.log('   Could not click expand button:', e.message);
            }
          }
        }
      }
    }
    
    console.log(`   ✓ Expanded ${expandedCount} nested experience entries`);
    console.log('   ✓ Experience section fully expanded');
  }
  
  // Step 1: Scroll and expand
  await autoScroll();
  await expandAllSections();
  await expandExperienceSection(); // Specifically expand experience section
  await new Promise(r => setTimeout(r, 1000));
  await autoScroll(); // Scroll again after expanding
  
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
  
  // Extract name - multiple selectors
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
  
  // Extract About section
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
  
  // Extract Experience with better parsing - check both modal and main page
  console.log('🏢 Extracting experience data...');

  // Helper: Fetch and parse the dedicated experiences page to get ALL entries
  async function fetchAllExperiencesFromDetails() {
    try {
      // Try to find the explicit link to the details page first
      let detailsHref = '';
      const expSectionNode = document.querySelector('#experience');
      const expContainerNode = expSectionNode?.closest('section') || document;
      const links = Array.from(expContainerNode.querySelectorAll('a[href]'));
      for (const a of links) {
        const text = a.textContent.toLowerCase();
        const href = a.getAttribute('href') || '';
        if ((text.includes('show all') || text.includes('see all')) && href.includes('details/experience')) {
          detailsHref = a.href || href;
          break;
        }
      }

      // Fallback: build details URL from current profile URL
      if (!detailsHref) {
        const base = window.location.href.split('?')[0].replace(/\/?$/, '/');
        if (base.includes('/in/')) {
          detailsHref = base + 'details/experience/';
        }
      }

      if (!detailsHref) return [];

      // Fetch with credentials to keep session
      const resp = await fetch(detailsHref, { credentials: 'include' });
      if (!resp.ok) return [];
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const results = [];

      // Parse experience items from details page (robust selectors)
      const items = doc.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.pvs-list__item--line-separated, li.artdeco-list__item');
      items.forEach((item) => {
        try {
          const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim())
            .filter(Boolean);

          const titleElem = item.querySelector('.mr1.t-bold span, .t-bold span, .pvs-entity__path span[aria-hidden="true"], span.t-bold > span[aria-hidden="true"]');
          const companyElem = item.querySelector('.t-14.t-normal span, .t-14 span, .pvs-entity__caption-wrapper span, .t-14.t-normal.t-black--light span[aria-hidden="true"]');

          const exp = {
            title: titleElem?.textContent?.trim() || spans[0] || '',
            company: companyElem?.textContent?.trim() || spans[1] || '',
            duration: '',
            location: '',
            description: ''
          };

          const durationPattern = /\d{4}|Present|yr|mo|year|month/i;
          const durationSpan = spans.find(s => durationPattern.test(s));
          if (durationSpan) exp.duration = durationSpan;

          const locationSpan = spans.find(s => s.includes(',') && !/\d{4}/.test(s) && s.length < 100 && s !== exp.title && s !== exp.company);
          if (locationSpan) exp.location = locationSpan;

          const descElem = item.querySelector('.inline-show-more-text, .t-14.t-normal.t-black, .pvs-list__outer-container, .display-flex.align-items-center.t-14.t-normal.t-black');
          if (descElem) {
            exp.description = descElem.textContent.trim().replace(/\s+/g, ' ');
          }

          if (exp.title || exp.company) results.push(exp);
        } catch {}
      });

      return results;
    } catch {
      return [];
    }
  }
  
  // First, try to fetch full experiences from the details page (avoids navigation)
  let detailsExperiences = await fetchAllExperiencesFromDetails();
  if (detailsExperiences.length > 0) {
    console.log(`   → Loaded ${detailsExperiences.length} experiences from details page`);
    // Deduplicate and assign later together with on-page extraction
  }

  // Check if experience modal is open
  const modal = document.querySelector('[role="dialog"], .artdeco-modal');
  const expSection = document.querySelector('#experience');
  
  // Determine where to look for experiences
  const experienceContainers = [];
  
  if (modal && modal.querySelector('[id*="experience"], [class*="experience"]')) {
    console.log('   → Found experience modal, extracting from there');
    experienceContainers.push(modal);
  }
  
  if (expSection) {
    const expContainer = expSection.closest('section');
    if (expContainer) {
      experienceContainers.push(expContainer);
    }
  }
  
  const seenExperiences = new Set(); // To avoid duplicates
  
  for (const container of experienceContainers) {
    const items = container.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
    console.log(`   → Found ${items.length} experience items in container`);
    
    items.forEach((item, index) => {
      try {
        // Get all visible text spans
        const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.textContent.trim())
          .filter(t => t && t.length > 0);
        
        // Try to find structured data - try multiple selectors
        const titleElem = item.querySelector('.mr1.t-bold span, .t-bold span, .pvs-entity__path span[aria-hidden="true"]');
        const companyElem = item.querySelector('.t-14.t-normal span, .t-14 span, .pvs-entity__caption-wrapper span');
        
        const experience = {
          title: titleElem?.textContent?.trim() || allSpans[0] || '',
          company: companyElem?.textContent?.trim() || allSpans[1] || '',
          duration: '',
          location: '',
          description: ''
        };
        
        // Find duration (contains years or dates)
        const durationPattern = /\d{4}|Present|yr|mo|year|month/i;
        const durationSpan = allSpans.find(s => durationPattern.test(s));
        if (durationSpan) experience.duration = durationSpan;
        
        // Find location (contains comma, no years)
        const locationSpan = allSpans.find(s => 
          s.includes(',') && 
          !/\d{4}/.test(s) && 
          s.length < 100 &&
          s !== experience.title &&
          s !== experience.company
        );
        if (locationSpan) experience.location = locationSpan;
        
        // Get description
        const descElem = item.querySelector('.inline-show-more-text, .t-14.t-normal.t-black, .pvs-list__outer-container');
        if (descElem) {
          experience.description = descElem.textContent.trim().replace(/\s+/g, ' ');
        }
        
        // Create unique key to avoid duplicates
        const expKey = `${experience.title}|${experience.company}|${experience.duration}`.toLowerCase();
        
        if ((experience.title || experience.company) && !seenExperiences.has(expKey)) {
          data.experience.push(experience);
          seenExperiences.add(expKey);
        }
      } catch (e) {
        console.log(`   ⚠️  Error parsing experience item ${index}:`, e.message);
      }
    });
  }
  
  // Merge with details page experiences, avoiding duplicates
  if (detailsExperiences.length > 0) {
    const seen = new Set(data.experience.map(e => `${(e.title||'').toLowerCase()}|${(e.company||'').toLowerCase()}|${(e.duration||'').toLowerCase()}`));
    for (const exp of detailsExperiences) {
      const key = `${(exp.title||'').toLowerCase()}|${(exp.company||'').toLowerCase()}|${(exp.duration||'').toLowerCase()}`;
      if (!seen.has(key)) {
        data.experience.push(exp);
        seen.add(key);
      }
    }
  }

  console.log(`   ✓ Extracted ${data.experience.length} unique experiences`);
  
  // Extract Education
  const eduSection = document.querySelector('#education');
  if (eduSection) {
    const eduContainer = eduSection.closest('section');
    if (eduContainer) {
      const items = eduContainer.querySelectorAll('li.artdeco-list__item');
      
      items.forEach((item, index) => {
        try {
          const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim())
            .filter(t => t && t.length > 0);
          
          const education = {
            school: allSpans[0] || '',
            degree: allSpans[1] || '',
            field: allSpans[2] || '',
            duration: '',
            description: ''
          };
          
          // Find duration
          const durationSpan = allSpans.find(s => /\d{4}/.test(s));
          if (durationSpan) education.duration = durationSpan;
          
          // Get description if exists
          const descElem = item.querySelector('.inline-show-more-text');
          if (descElem) {
            education.description = descElem.textContent.trim();
          }
          
          if (education.school) {
            data.education.push(education);
          }
        } catch (e) {
          console.log(`Error parsing education item ${index}:`, e.message);
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
      
      // Remove duplicates
      data.skills = [...new Set(data.skills)];
    }
  }
  
  // Extract Certifications
  const certsSection = document.querySelector('#licenses_and_certifications');
  if (certsSection) {
    const certsContainer = certsSection.closest('section');
    if (certsContainer) {
      const items = certsContainer.querySelectorAll('li.artdeco-list__item');
      
      items.forEach((item, index) => {
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
            
            // Try to find credential link
            const link = item.querySelector('a[href*="credential"]');
            if (link) cert.url = link.href;
            
            if (cert.name) {
              data.certifications.push(cert);
            }
          }
        } catch (e) {
          console.log(`Error parsing certification item ${index}:`, e.message);
        }
      });
    }
  }
  
  // Extract Projects
  const projSection = document.querySelector('#projects');
  if (projSection) {
    const projContainer = projSection.closest('section');
    if (projContainer) {
      const items = projContainer.querySelectorAll('li.artdeco-list__item');
      
      items.forEach((item, index) => {
        try {
          const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim())
            .filter(t => t && t.length > 0);
          
          const project = {
            name: allSpans[0] || '',
            description: allSpans.slice(1).join(' ') || '',
            url: ''
          };
          
          // Try to find project link
          const link = item.querySelector('a[href]');
          if (link && !link.href.includes('linkedin.com')) {
            project.url = link.href;
          }
          
          if (project.name) {
            data.projects.push(project);
          }
        } catch (e) {
          console.log(`Error parsing project item ${index}:`, e.message);
        }
      });
    }
  }
  
  // Extract Volunteer Experience
  const volSection = document.querySelector('#volunteering_experience');
  if (volSection) {
    const volContainer = volSection.closest('section');
    if (volContainer) {
      const items = volContainer.querySelectorAll('li.artdeco-list__item');
      
      items.forEach((item, index) => {
        try {
          const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim())
            .filter(t => t && t.length > 0);
          
          if (allSpans.length > 0) {
            data.volunteer.push({
              role: allSpans[0] || '',
              organization: allSpans[1] || '',
              duration: allSpans.find(s => /\d{4}|Present/.test(s)) || '',
              cause: allSpans[2] || ''
            });
          }
        } catch (e) {
          console.log(`Error parsing volunteer item ${index}:`, e.message);
        }
      });
    }
  }
  
  // Extract Languages
  const langSection = document.querySelector('#languages');
  if (langSection) {
    const langContainer = langSection.closest('section');
    if (langContainer) {
      const items = langContainer.querySelectorAll('li.artdeco-list__item');
      
      items.forEach((item, index) => {
        try {
          const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map(s => s.textContent.trim())
            .filter(t => t && t.length > 0);
          
          if (allSpans.length > 0) {
            data.languages.push({
              name: allSpans[0] || '',
              proficiency: allSpans[1] || ''
            });
          }
        } catch (e) {
          console.log(`Error parsing language item ${index}:`, e.message);
        }
      });
    }
  }
  
  // Print summary
  console.log('\n✅ Extraction complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Data Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Name:', data.name || '❌ Not found');
  console.log('   Headline:', data.headline ? '✓' : '❌');
  console.log('   Location:', data.location || '❌ Not found');
  console.log('   About:', data.about ? `✓ (${data.about.length} chars)` : '❌');
  console.log('   Experience:', data.experience.length, 'entries');
  console.log('   Education:', data.education.length, 'entries');
  console.log('   Skills:', data.skills.length, 'skills');
  console.log('   Certifications:', data.certifications.length, 'certs');
  console.log('   Projects:', data.projects.length, 'projects');
  console.log('   Volunteer:', data.volunteer.length, 'entries');
  console.log('   Languages:', data.languages.length, 'languages');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Sample preview
  if (data.experience.length > 0) {
    console.log('📌 Sample Experience Entry:');
    console.log(JSON.stringify(data.experience[0], null, 2));
    console.log('');
  }
  
  console.log('📥 DOWNLOADING DATA...');
  
  // Create and download file
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'linkedin-full-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('✅ File downloaded as: linkedin-full-data.json');
  console.log('\n📝 Next Steps:');
  console.log('   1. Find the downloaded file in your Downloads folder');
  console.log('   2. Move it to your project scripts folder:');
  console.log('      mv ~/Downloads/linkedin-full-data.json ~/Documents/GitHub/mocialov.github.io/scripts/');
  console.log('   3. Verify the data looks correct');
  console.log('   4. Use it in your portfolio!\n');
  
  // Also copy to clipboard if possible
  try {
    await navigator.clipboard.writeText(dataStr);
    console.log('📋 Data also copied to clipboard!');
  } catch (e) {
    console.log('ℹ️  Could not copy to clipboard (browser restriction)');
  }
  
  return data;
})();
