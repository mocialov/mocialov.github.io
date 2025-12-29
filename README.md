# LinkedIn Data Extractor

Tools to extract your LinkedIn profile data directly from linkedin.com.

## ⚡ EASIEST METHOD - React App (Recommended)

**Just run one command:**

```bash
pkill -f "node server/index.js"; npm run dev
```

Then:
1. Open browser to `http://localhost:5173`
2. Click "Start Browser & Login"
3. Log into LinkedIn in the popup window
4. Click "Extract All My Data"
5. Wait 30 seconds - done!

**✨ Extracts ALL experiences** (including hidden ones and nested roles at same companies)

See [APP_QUICK_START.md](APP_QUICK_START.md) for detailed guide.

### Debug Mode vs Default Sequence

- Config file: `src/config.js`
- `DEBUG=false` (default): UI shows a single button that runs a streamlined headless scrape sequence using the LinkedIn URL you provide.
- `DEBUG=true`: UI exposes all manual controls (start browser, headless switch, navigate to profile, extract data, close browser, console logs).

---

## 🚨 Alternative Extraction Methods

This project includes **4 different methods** to extract your data:

1. **Automated Browser Extraction** ⭐ **EASIEST** - Opens browser, you log in, auto-extracts everything
2. **Browser Console Script** - Run directly in your browser while viewing your profile
3. **LinkedIn Data Export** - Download official export from LinkedIn
4. **Puppeteer Headless Browser** - Automated scraping (may be blocked)

**📖 [Read the Complete Guide](LINKEDIN_WORKAROUNDS.md)** for detailed instructions on each method.

---

## Available Tools

### 1. Automated Browser Extraction (Recommended) ⭐

The easiest method - fully automated:

```bash
npm run extract
```

Opens a browser, waits for you to log in, then automatically extracts everything.

### 2. Browser Console Script

The manual but reliable method:

1. Open your LinkedIn profile in a browser
2. Open the browser console (F12 or Cmd+Option+I)
3. Copy and paste the script from [scripts/linkedin-console-script.js](scripts/linkedin-console-script.js)
4. The script will extract all your data and display it in the console

### 3. Manual Data Collection

Interactive CLI tool to manually input your LinkedIn data:

```bash
npm run collect
```

### 4. Automated Fetching with Puppeteer

Attempts to scrape your profile automatically (may be blocked):

```bash
npm run fetch
```

### 5. Parse LinkedIn Data Export

If you downloaded your official LinkedIn data export:

```bash
npm run parse-export /path/to/linkedin-export-folder
```

## Installation

Install dependencies:

```bash
npm install
```

## Output

All methods save extracted data to JSON files in the `scripts/` directory for easy review and use.

## LinkedIn Data Export Instructions

1. Go to [LinkedIn Data Settings](https://www.linkedin.com/psettings/member-data)
2. Click "Get a copy of your data"
3. Select what you want to download (or select all)
4. Request archive (takes up to 24 hours)
5. Download and extract the ZIP file
6. Run the parser: `npm run parse-export /path/to/extracted/folder`

## Project Structure

```
scripts/
├── linkedin-console-script.js   # Browser console extraction script
├── collect-linkedin-data.js     # Interactive CLI data collection
├── fetch-linkedin.js            # Automated Puppeteer scraper
├── parse-linkedin-export.js     # Parse official LinkedIn export
├── download-helper.sh           # Helper for downloading exports
└── linkedin-data.json           # Output data file
```

## Technologies Used

- **Puppeteer**: Headless browser automation
- **Cheerio**: HTML parsing
- **Axios**: HTTP requests

## Additional Documentation

- [LINKEDIN_WORKAROUNDS.md](LINKEDIN_WORKAROUNDS.md) - Detailed guide on all extraction methods
- [QUICK_START.md](QUICK_START.md) - Quick start guide
- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup instructions
- [EXTRACTION_TIPS.md](EXTRACTION_TIPS.md) - Tips for successful data extraction
- [DOWNLOAD_DATA_INSTRUCTIONS.md](DOWNLOAD_DATA_INSTRUCTIONS.md) - LinkedIn data download guide

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!

