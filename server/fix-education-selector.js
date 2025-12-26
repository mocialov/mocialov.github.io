const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the education extraction to use better selectors
const oldCode = `      // Extract ALL education from details page
      allEducation = await page.evaluate(() => {
        const education = [];
        const items = document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item');`;

const newCode = `      // Extract ALL education from details page
      allEducation = await page.evaluate(() => {
        const education = [];
        
        // Only select items from the main content area, not from "Who viewed" sidebar
        const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        const items = mainContent.querySelectorAll('.pvs-list__item--line-separated, li.pvs-list__paged-list-item');`;

content = content.replace(oldCode, newCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Updated education selector to use main content area only');
