const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the education extraction to add filtering
const oldCode = `            const edu = {
              school: schoolElem?.textContent?.trim() || allSpans[0] || '',
              degree: degreeElem?.textContent?.trim() || allSpans[1] || '',
              field: allSpans[2] || '',
              duration: dateElem?.textContent?.trim() || allSpans.find(s => /\\d{4}/.test(s)) || '',
              description: ''
            };
            
            if (edu.school) {
              education.push(edu);
            }`;

const newCode = `            const edu = {
              school: schoolElem?.textContent?.trim() || allSpans[0] || '',
              degree: degreeElem?.textContent?.trim() || allSpans[1] || '',
              field: allSpans[2] || '',
              duration: dateElem?.textContent?.trim() || allSpans.find(s => /\\d{4}/.test(s)) || '',
              description: ''
            };
            
            // Filter out viewer data (same logic as experiences)
            const isViewerData = 
              edu.school.startsWith('Someone at') ||
              edu.degree.startsWith('Someone at') ||
              edu.school.includes('…') ||
              edu.school.includes('...') ||
              (edu.school.match(/\\bat\\b/i) && !edu.degree && !edu.duration) ||
              (!edu.duration && !edu.degree && edu.school);
            
            if (edu.school && !isViewerData) {
              education.push(edu);
            }`;

content = content.replace(oldCode, newCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Added education filtering');
