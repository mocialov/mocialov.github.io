const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the line with "let allExperiences = [];"
const allExpLine = content.indexOf('let allExperiences = [];');
if (allExpLine === -1) {
  console.error('Could not find allExperiences declaration');
  process.exit(1);
}

// Insert allEducation declaration right after
const insertPoint1 = content.indexOf('\n', allExpLine) + 1;
const educationDeclaration = '    let allEducation = [];\n';
content = content.slice(0, insertPoint1) + educationDeclaration + content.slice(insertPoint1);

// Find "Navigate BACK to main profile page" after experiences
const navBackText = '      // Navigate BACK to main profile page\n      console.log(\'🔙 Navigating back to main profile page...\');\n      await page.goto(profileUrl, { waitUntil: \'domcontentloaded\', timeout: 60000 });\n      await new Promise(r => setTimeout(r, 2000));\n    }\n\n    console.log(\'📊 Extracting remaining data from main profile...\');';

const navBackIndex = content.indexOf(navBackText);
if (navBackIndex === -1) {
  console.error('Could not find navigation back text');
  process.exit(1);
}

// Insert education expansion code after the closing brace and before "Extracting remaining data"
const insertionCode = `
    // Navigate to education details page
    console.log('🔧 Expanding ALL education (navigating to details/education/)...');
    const profileMatch = profileUrl.match(/linkedin\\.com\\/in\\/([^\\/\\?]+)/);
    if (profileMatch) {
      const username = profileMatch[1];
      const educationUrl = \`https://www.linkedin.com/in/\${username}/details/education/\`;
      
      console.log(\`   → Navigating to: \${educationUrl}\`);
      await page.goto(educationUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      // Scroll to load all education
      console.log('   → Scrolling to load all education...');
      await page.evaluate(async () => {
        const main = document.querySelector('main');
        if (main) {
          for (let i = 0; i < 10; i++) {
            main.scrollTop = main.scrollHeight;
            await new Promise(r => setTimeout(r, 500));
          }
        }
      });
      
      console.log('   ✓ Education details page loaded');
      
      // Extract ALL education from details page
      allEducation = await page.evaluate(() => {
        const education = [];
        const items = document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item');
        
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
              duration: dateElem?.textContent?.trim() || allSpans.find(s => /\\d{4}/.test(s)) || '',
              description: ''
            };
            
            if (edu.school) {
              education.push(edu);
            }
          } catch (e) {
            // Ignore
          }
        });
        
        return education;
      });
      
      console.log(\`   ✓ Extracted \${allEducation.length} education entries from details page\`);
      
      // Navigate back to profile
      console.log('🔙 Navigating back to main profile page...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 2000));
    }

`;

// Replace the text with the text + insertion
const replacement = navBackText.replace(
  '    console.log(\'📊 Extracting remaining data from main profile...\');',
  insertionCode + '    console.log(\'📊 Extracting remaining data from main profile...\');'
);

content = content.replace(navBackText, replacement);

// Find where to add the education merge (after experience merge)
const expMerge = '    if (allExperiences.length > 0) {\n      data.experience = allExperiences;\n      console.log(`✅ Using ${allExperiences.length} experiences from details page`);\n    }';
const expMergeIndex = content.indexOf(expMerge);

if (expMergeIndex === -1) {
  console.error('Could not find experience merge');
  process.exit(1);
}

const eduMergeCode = `\n\n    // Replace the education data with what we extracted from the details page\n    if (allEducation && allEducation.length > 0) {\n      data.education = allEducation;\n      console.log(\`✅ Using \${allEducation.length} education entries from details page\`);\n    }`;

const insertPoint3 = content.indexOf('\n', expMergeIndex + expMerge.length);
content = content.slice(0, insertPoint3) + eduMergeCode + content.slice(insertPoint3);

// Write the modified content
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Successfully patched index.js with education expansion');
console.log('Lines in file:', content.split('\n').length);
