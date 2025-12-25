#!/bin/bash

# Display instructions for LinkedIn data extraction
cat << "EOF"

╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀  LinkedIn Data Extractor - Ready to Run!                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📋 QUICK START:

   Run this command:

      npm run extract


✨ What happens next:

   1. ✅  Browser opens automatically
   2. 👤  You log in to LinkedIn (manual, one-time)
   3. ⚡  Script auto-extracts ALL your data
   4. 💾  Saves to scripts/linkedin-full-data.json
   5. 🎉  Done in ~60 seconds!


📦 What gets extracted:

   ✓ Profile info (name, headline, photo, about)
   ✓ ALL experiences (including hidden ones)
   ✓ Education
   ✓ Skills
   ✓ Certifications
   ✓ Projects, Volunteer, Languages


🔒 Privacy:

   • Runs locally on your machine
   • No data sent anywhere
   • You control everything
   • Script never sees your password


📖 Need help?

   Quick reference:  QUICK_EXTRACT.md
   Full guide:       EXPERIENCE_EXTRACTION_GUIDE.md
   Main README:      README.md


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to extract your LinkedIn data?

Run:  npm run extract

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
