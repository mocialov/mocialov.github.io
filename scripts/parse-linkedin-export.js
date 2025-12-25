// LinkedIn Data Export Parser
// Download your LinkedIn data: https://www.linkedin.com/psettings/member-data
// Extract the ZIP file and point this script to it
// Usage: node scripts/parse-linkedin-export.js /path/to/linkedin-export-folder

const fs = require('fs');
const path = require('path');

function parseLinkedInExport(exportPath) {
  console.log('📦 Parsing LinkedIn data export from:', exportPath);
  
  try {
    // LinkedIn exports contain CSV files with your data
    const profilePath = path.join(exportPath, 'Profile.csv');
    const positionsPath = path.join(exportPath, 'Positions.csv');
    const educationPath = path.join(exportPath, 'Education.csv');
    const skillsPath = path.join(exportPath, 'Skills.csv');
    const certificationsPath = path.join(exportPath, 'Certifications.csv');
    const languagesPath = path.join(exportPath, 'Languages.csv');
    
    const profileData = {
      name: '',
      headline: '',
      location: '',
      summary: '',
      experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
    };
    
    // Parse Profile.csv
    if (fs.existsSync(profilePath)) {
      console.log('✓ Found Profile.csv');
      const content = fs.readFileSync(profilePath, 'utf-8');
      const lines = content.split('\n');
      
      // Simple CSV parsing (LinkedIn exports are simple CSVs)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          if (values[0]) profileData.name = `${values[0]} ${values[1]}`.trim();
          if (values[2]) profileData.headline = values[2];
          // Add more fields as needed based on CSV structure
        }
      }
    }
    
    // Parse Positions.csv
    if (fs.existsSync(positionsPath)) {
      console.log('✓ Found Positions.csv');
      const content = fs.readFileSync(positionsPath, 'utf-8');
      const lines = content.split('\n');
      const headers = parseCSVLine(lines[0]);
      
      let filteredCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          const position = {};
          headers.forEach((header, index) => {
            position[header] = values[index] || '';
          });
          
          const title = position['Title'] || position['Position Title'] || '';
          const company = position['Company Name'] || '';
          const startDate = position['Started On'] || '';
          const endDate = position['Finished On'] || '';
          
          // Filter out "who viewed me" and "who your viewers also viewed" entries
          // These are viewer data that LinkedIn mistakenly includes in Positions.csv
          const isViewerData = 
            !title || // Empty title
            title.startsWith('Someone at') || // "Someone at [Company]"
            company.startsWith('Someone at') || // Company is "Someone at..."
            title.includes('…') || // Truncated viewer entries with ellipsis
            (title.match(/\bat\b/i) && !company && title.split(/\bat\b/i).length === 2) || // "Job Title at Company" format with no separate company field
            (!startDate && !endDate && !company); // No dates AND no company (viewer data has none of these)
          
          if (isViewerData) {
            filteredCount++;
            console.log(`   ⚠️  Filtered viewer data: "${title}" (company: "${company}")`);
          } else if (title) {
            profileData.experience.push({
              title: title,
              company: company,
              duration: `${startDate} - ${endDate || 'Present'}`,
              location: position['Location'] || '',
              description: position['Description'] || '',
            });
          }
        }
      }
      
      if (filteredCount > 0) {
        console.log(`   → Filtered out ${filteredCount} viewer data entries`);
      }
    }
    
    // Parse Education.csv
    if (fs.existsSync(educationPath)) {
      console.log('✓ Found Education.csv');
      const content = fs.readFileSync(educationPath, 'utf-8');
      const lines = content.split('\n');
      const headers = parseCSVLine(lines[0]);
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          const edu = {};
          headers.forEach((header, index) => {
            edu[header] = values[index] || '';
          });
          
          profileData.education.push({
            school: edu['School Name'] || '',
            degree: edu['Degree Name'] || '',
            duration: `${edu['Start Date'] || ''} - ${edu['End Date'] || ''}`,
            description: edu['Notes'] || '',
          });
        }
      }
    }
    
    // Parse Skills.csv
    if (fs.existsSync(skillsPath)) {
      console.log('✓ Found Skills.csv');
      const content = fs.readFileSync(skillsPath, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          if (values[0]) {
            profileData.skills.push(values[0]);
          }
        }
      }
    }
    
    // Parse Certifications.csv
    if (fs.existsSync(certificationsPath)) {
      console.log('✓ Found Certifications.csv');
      const content = fs.readFileSync(certificationsPath, 'utf-8');
      const lines = content.split('\n');
      const headers = parseCSVLine(lines[0]);
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          const cert = {};
          headers.forEach((header, index) => {
            cert[header] = values[index] || '';
          });
          
          profileData.certifications.push({
            name: cert['Name'] || '',
            issuer: cert['Authority'] || '',
            date: cert['Started On'] || '',
          });
        }
      }
    }
    
    // Parse Languages.csv
    if (fs.existsSync(languagesPath)) {
      console.log('✓ Found Languages.csv');
      const content = fs.readFileSync(languagesPath, 'utf-8');
      const lines = content.split('\n');
      const headers = parseCSVLine(lines[0]);
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const values = parseCSVLine(line);
          const lang = {};
          headers.forEach((header, index) => {
            lang[header] = values[index] || '';
          });
          
          profileData.languages.push({
            name: lang['Name'] || '',
            proficiency: lang['Proficiency'] || '',
          });
        }
      }
    }
    
    console.log('\n✅ Successfully parsed LinkedIn export!');
    console.log('\n📊 Data Summary:');
    console.log(`   Name: ${profileData.name}`);
    console.log(`   Experience: ${profileData.experience.length} positions`);
    console.log(`   Education: ${profileData.education.length} entries`);
    console.log(`   Skills: ${profileData.skills.length} skills`);
    console.log(`   Certifications: ${profileData.certifications.length} certifications`);
    console.log(`   Languages: ${profileData.languages.length} languages`);
    
    // Save to JSON
    const outputPath = path.join(__dirname, 'linkedin-parsed-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(profileData, null, 2));
    console.log(`\n💾 Saved to: ${outputPath}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Copy the content of linkedin-parsed-data.json');
    console.log('   2. Update the getMockProfileData() function in server/index.js');
    console.log('   3. Restart the server\n');
    
    return profileData;
    
  } catch (error) {
    console.error('❌ Error parsing LinkedIn export:', error.message);
    console.log('\n📖 How to get your LinkedIn data:');
    console.log('   1. Go to https://www.linkedin.com/psettings/member-data');
    console.log('   2. Click "Request archive"');
    console.log('   3. Wait for email (can take up to 24 hours)');
    console.log('   4. Download and extract the ZIP file');
    console.log('   5. Run this script with the path to the extracted folder\n');
    return null;
  }
}

// Simple CSV parser for LinkedIn exports
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Run if called directly
if (require.main === module) {
  const exportPath = process.argv[2];
  
  if (!exportPath) {
    console.log('❌ Please provide the path to your LinkedIn export folder');
    console.log('\nUsage:');
    console.log('   node scripts/parse-linkedin-export.js /path/to/linkedin/export\n');
    console.log('📖 How to get your LinkedIn data:');
    console.log('   1. Go to https://www.linkedin.com/psettings/member-data');
    console.log('   2. Click "Get a copy of your data"');
    console.log('   3. Select "Want something in particular? Select the data files you\'re most interested in."');
    console.log('   4. Check all relevant boxes and click "Request archive"');
    console.log('   5. Wait for email (can take up to 24 hours)');
    console.log('   6. Download and extract the ZIP file');
    console.log('   7. Run this script again with the path\n');
    process.exit(1);
  }
  
  if (!fs.existsSync(exportPath)) {
    console.log(`❌ Path not found: ${exportPath}\n`);
    process.exit(1);
  }
  
  parseLinkedInExport(exportPath);
}

module.exports = { parseLinkedInExport };
