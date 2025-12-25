// LinkedIn Data Extractor Frontend Script

const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/mocialov/';

// The extraction script that will run in the console
const EXTRACTION_SCRIPT = `(async function() {
  console.log('🚀 Starting LinkedIn data extraction...');
  
  async function autoScroll() {
    console.log('📜 Scrolling through profile...');
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          setTimeout(resolve, 1000);
        }
      }, 100);
    });
  }
  
  async function expandSections() {
    console.log('🔍 Expanding sections...');
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.textContent.includes('Show more') || btn.textContent.includes('See more')) {
        try {
          btn.click();
          await new Promise(r => setTimeout(r, 300));
        } catch(e) {}
      }
    }
  }
  
  await autoScroll();
  await expandSections();
  await autoScroll();
  
  console.log('📊 Extracting data...');
  
  const data = {
    name: document.querySelector('h1')?.textContent?.trim() || '',
    headline: document.querySelector('.text-body-medium')?.textContent?.trim() || '',
    location: document.querySelector('.text-body-small.inline')?.textContent?.trim() || '',
    about: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    volunteer: [],
    languages: [],
  };
  
  const aboutSection = document.querySelector('#about');
  if (aboutSection) {
    data.about = aboutSection.parentElement.querySelector('.display-flex.ph5.pv3')?.textContent?.trim() || '';
  }
  
  const expSection = document.querySelector('#experience');
  if (expSection) {
    const items = expSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        const exp = {
          title: spans[0] || '',
          company: spans[1] || '',
          duration: spans.find(s => s.match(/\\d{4}|Present|yr|mo/)) || '',
          location: spans.find(s => s.includes(',') && !s.match(/\\d{4}/) && s.length < 100) || '',
          description: ''
        };
        if (exp.title) data.experience.push(exp);
      }
    });
  }
  
  const eduSection = document.querySelector('#education');
  if (eduSection) {
    const items = eduSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        data.education.push({
          school: spans[0] || '',
          degree: spans[1] || '',
          duration: spans.find(s => s.match(/\\d{4}/)) || '',
          description: ''
        });
      }
    });
  }
  
  const skillsSection = document.querySelector('#skills');
  if (skillsSection) {
    const skillSpans = skillsSection.parentElement.querySelectorAll('.mr1.t-bold span[aria-hidden="true"]');
    skillSpans.forEach(span => {
      const skill = span.textContent.trim();
      if (skill && !skill.includes('endorsement')) {
        data.skills.push(skill);
      }
    });
  }
  
  const certsSection = document.querySelector('#licenses_and_certifications');
  if (certsSection) {
    const items = certsSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        data.certifications.push({
          name: spans[0] || '',
          issuer: spans[1] || '',
          date: spans.find(s => s.match(/\\d{4}/)) || ''
        });
      }
    });
  }
  
  const projSection = document.querySelector('#projects');
  if (projSection) {
    const items = projSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        data.projects.push({
          name: spans[0] || '',
          description: spans.slice(1).join(' ')
        });
      }
    });
  }
  
  const volSection = document.querySelector('#volunteering_experience');
  if (volSection) {
    const items = volSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        data.volunteer.push({
          role: spans[0] || '',
          organization: spans[1] || '',
          duration: spans.find(s => s.match(/\\d{4}|Present/)) || ''
        });
      }
    });
  }
  
  const langSection = document.querySelector('#languages');
  if (langSection) {
    const items = langSection.parentElement.querySelectorAll('li.artdeco-list__item');
    items.forEach(item => {
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.textContent.trim())
        .filter(t => t);
      
      if (spans.length > 0) {
        data.languages.push({
          name: spans[0] || '',
          proficiency: spans[1] || ''
        });
      }
    });
  }
  
  console.log('✅ Extraction complete!');
  console.log('📋 Summary:');
  console.log('   Name:', data.name);
  console.log('   Experience:', data.experience.length, 'entries');
  console.log('   Education:', data.education.length, 'entries');
  console.log('   Skills:', data.skills.length, 'skills');
  console.log('   Certifications:', data.certifications.length, 'certs');
  console.log('   Projects:', data.projects.length, 'projects');
  console.log('   Volunteer:', data.volunteer.length, 'entries');
  console.log('   Languages:', data.languages.length, 'languages');
  
  console.log('\\n📥 DOWNLOAD YOUR DATA:');
  console.log('Copy the JSON below and save it as linkedin-data.json:\\n');
  
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'linkedin-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('✅ File downloaded! Check your Downloads folder.');
  
  return data;
})();`;

function showInstructions() {
    const modal = document.getElementById('instructionsModal');
    const scriptElement = document.getElementById('extractionScript');
    scriptElement.textContent = EXTRACTION_SCRIPT;
    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('instructionsModal');
    modal.classList.remove('active');
}

function openLinkedIn() {
    window.open(LINKEDIN_PROFILE_URL, '_blank');
}

function copyScript() {
    const scriptText = EXTRACTION_SCRIPT;
    const button = event.target;
    
    navigator.clipboard.writeText(scriptText).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        alert('Failed to copy. Please select and copy the text manually.');
    });
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('instructionsModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});
