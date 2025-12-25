// Interactive LinkedIn Data Input Tool
// This helps you easily input your LinkedIn data by guiding you through each section

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function collectProfileData() {
  console.log('\n===========================================');
  console.log('LinkedIn Profile Data Collector');
  console.log('===========================================\n');
  console.log('📋 Open your LinkedIn profile in a browser:');
  console.log('   https://www.linkedin.com/in/mocialov/\n');
  console.log('Then copy the information and paste it here.\n');
  console.log('Press ENTER to skip any field.\n');

  const data = {
    name: '',
    headline: '',
    location: '',
    email: '',
    phone: '',
    linkedinUrl: 'https://www.linkedin.com/in/mocialov/',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: []
  };

  // Basic Info
  console.log('--- BASIC INFORMATION ---\n');
  data.name = await question('Your full name: ') || 'Boris Mocialov';
  data.headline = await question('Your headline/title: ');
  data.location = await question('Your location: ');
  data.email = await question('Your email (optional): ');
  data.phone = await question('Your phone (optional): ');
  data.summary = await question('Your summary/about section: ');

  // Experience
  console.log('\n--- EXPERIENCE ---\n');
  let addMore = true;
  let expCount = 1;
  
  while (addMore) {
    console.log(`\nExperience #${expCount}:`);
    const title = await question('  Job title: ');
    if (!title) break;
    
    const company = await question('  Company name: ');
    const duration = await question('  Duration (e.g., "Jan 2020 - Present"): ');
    const location = await question('  Location: ');
    const description = await question('  Description: ');
    
    data.experience.push({ title, company, duration, location, description });
    expCount++;
    
    const more = await question('\nAdd another experience? (y/n): ');
    addMore = more.toLowerCase() === 'y';
  }

  // Education
  console.log('\n--- EDUCATION ---\n');
  addMore = true;
  let eduCount = 1;
  
  while (addMore) {
    console.log(`\nEducation #${eduCount}:`);
    const school = await question('  School/University: ');
    if (!school) break;
    
    const degree = await question('  Degree: ');
    const duration = await question('  Years (e.g., "2014 - 2018"): ');
    const description = await question('  Description (optional): ');
    
    data.education.push({ school, degree, duration, description });
    eduCount++;
    
    const more = await question('\nAdd another education? (y/n): ');
    addMore = more.toLowerCase() === 'y';
  }

  // Skills
  console.log('\n--- SKILLS ---\n');
  console.log('Enter your skills separated by commas:');
  const skillsInput = await question('Skills: ');
  if (skillsInput) {
    data.skills = skillsInput.split(',').map(s => s.trim()).filter(s => s);
  }

  // Certifications
  console.log('\n--- CERTIFICATIONS ---\n');
  addMore = true;
  let certCount = 1;
  
  while (addMore) {
    console.log(`\nCertification #${certCount}:`);
    const name = await question('  Certification name: ');
    if (!name) break;
    
    const issuer = await question('  Issuing organization: ');
    const date = await question('  Date/Year: ');
    
    data.certifications.push({ name, issuer, date });
    certCount++;
    
    const more = await question('\nAdd another certification? (y/n): ');
    addMore = more.toLowerCase() === 'y';
  }

  // Languages
  console.log('\n--- LANGUAGES ---\n');
  addMore = true;
  let langCount = 1;
  
  while (addMore) {
    console.log(`\nLanguage #${langCount}:`);
    const name = await question('  Language: ');
    if (!name) break;
    
    const proficiency = await question('  Proficiency (e.g., "Native", "Professional"): ');
    
    data.languages.push({ name, proficiency });
    langCount++;
    
    const more = await question('\nAdd another language? (y/n): ');
    addMore = more.toLowerCase() === 'y';
  }

  // Save the data
  console.log('\n\n===========================================');
  console.log('Saving your data...');
  console.log('===========================================\n');

  const outputPath = path.join(__dirname, '..', 'server', 'profile-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  
  console.log('✅ Data saved to:', outputPath);
  console.log('\nNow updating server/index.js...\n');

  // Update the server file
  updateServerFile(data);

  console.log('✅ All done! Your profile data has been updated.');
  console.log('\nRefresh your browser at http://localhost:3000 to see the changes.\n');
  
  rl.close();
}

function updateServerFile(data) {
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  let serverContent = fs.readFileSync(serverPath, 'utf8');

  const newMockData = `function getMockProfileData() {
  return ${JSON.stringify(data, null, 4)};
}`;

  // Replace the getMockProfileData function
  serverContent = serverContent.replace(
    /function getMockProfileData\(\) \{[\s\S]*?\n\}/,
    newMockData
  );

  fs.writeFileSync(serverPath, serverContent);
  console.log('✅ Updated server/index.js with your profile data');
}

// Run the collector
collectProfileData().catch(console.error);
