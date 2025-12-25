// LinkedIn Profile Data Extractor
// Run this script to fetch and display data from your LinkedIn profile
// Usage: node scripts/fetch-linkedin.js

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const LINKEDIN_URL = 'https://www.linkedin.com/in/mocialov/';

async function fetchLinkedInProfile() {
  console.log('🔍 Fetching LinkedIn profile from:', LINKEDIN_URL);
  console.log('');

  try {
    const response = await axios.get(LINKEDIN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    });

    // Save raw HTML for inspection
    const htmlPath = path.join(__dirname, 'linkedin-raw.html');
    fs.writeFileSync(htmlPath, response.data);
    console.log('✅ Saved raw HTML to:', htmlPath);
    console.log('');

    const $ = cheerio.load(response.data);

    // Extract all possible data
    const extractedData = {
      name: extractText($, [
        'h1.top-card-layout__title',
        'h1.inline.t-24.v-align-middle.break-words',
        '.top-card__title',
        'h1'
      ]),
      headline: extractText($, [
        '.top-card-layout__headline',
        '.top-card__headline',
        'h2.mt1.t-18.t-black.t-normal',
        '.top-card-layout__subline'
      ]),
      location: extractText($, [
        '.top-card-layout__first-subline .top-card__subline-item',
        '.top-card__subline-item',
        '[class*="location"]'
      ]),
      summary: extractText($, [
        '.summary__text',
        '.core-section-container__content p',
        '[class*="about"] p'
      ]),
    };

    console.log('📋 Extracted Data:');
    console.log(JSON.stringify(extractedData, null, 2));
    console.log('');

    // Try to find all section headings to understand structure
    console.log('📑 Found Sections:');
    $('h2, h3').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text && text.length < 50) {
        console.log(`  - ${text}`);
      }
    });
    console.log('');

    // Check if we got blocked
    const title = $('title').text();
    if (title.toLowerCase().includes('sign in') || title.toLowerCase().includes('login')) {
      console.log('⚠️  LinkedIn is requiring sign-in. The profile is not publicly accessible.');
      console.log('');
      console.log('📝 SOLUTION OPTIONS:');
      console.log('  1. Make your LinkedIn profile public in settings');
      console.log('  2. Use LinkedIn API with authentication');
      console.log('  3. Manually copy your data into server/index.js');
      console.log('');
    } else {
      console.log('✅ Got response from LinkedIn');
      
      // Save extracted data
      const dataPath = path.join(__dirname, 'linkedin-data.json');
      fs.writeFileSync(dataPath, JSON.stringify(extractedData, null, 2));
      console.log('💾 Saved extracted data to:', dataPath);
    }

    console.log('');
    console.log('📄 Page Title:', title);

  } catch (error) {
    console.error('❌ Error fetching LinkedIn profile:');
    console.error('   Message:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
    }
    
    console.log('');
    console.log('💡 This is expected - LinkedIn blocks automated scraping.');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('  1. Open https://www.linkedin.com/in/mocialov/ in your browser');
    console.log('  2. Copy your information manually');
    console.log('  3. Update the getMockProfileData() function in server/index.js');
    console.log('');
  }
}

function extractText($, selectors) {
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text) return text;
  }
  return '';
}

// Run the script
fetchLinkedInProfile();
