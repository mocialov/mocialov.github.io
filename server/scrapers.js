/**
 * Extraction functions for LinkedIn data.
 * Updated for LinkedIn's new SDUI DOM structure (2025+).
 * These are designed to be run inside page.evaluate().
 *
 * IMPORTANT: Each function must be fully self-contained because
 * page.evaluate() serializes each function individually.
 * All helper functions are inlined as local functions.
 *
 * LinkedIn uses hashed CSS class names that change frequently.
 * We rely on stable selectors: data-testid, data-view-name, componentkey,
 * aria-label, structural position, and text-based heuristics.
 */

// ─── Experience ────────────────────────────────────────────────

function extractExperienceData() {
    // ── Inline helpers ──
    function isDateLike(text) {
        return /\b\d{4}\b/.test(text) || /\bpresent\b/i.test(text);
    }
    function isLocationLike(text) {
        // Don't treat "Company · Employment Type" patterns as locations
        if (text.includes(' · ') && /\b(full.?time|part.?time|contract|freelance|self.?employed|internship|seasonal|apprenticeship)\b/i.test(text)) return false;
        return text.includes(',') && !/\b\d{4}\b/.test(text) && text.length < 120;
    }
    function isWorkArrangement(text) {
        return /^(on.?site|remote|hybrid)$/i.test(text.trim());
    }
    function parseDateRange(text) {
        if (!text) return { range: '', startDate: '', endDate: '', duration: '' };
        let t = text.replace(/\s+/g, ' ').trim();
        let duration = '';
        if (t.includes(' · ')) {
            const parts = t.split(' · ');
            t = parts[0].trim();
            duration = parts.slice(1).join(' · ').trim();
        }
        if (!/\b\d{4}\b/.test(t) && !/present/i.test(t)) {
            return { range: '', startDate: '', endDate: '', duration: '' };
        }
        const splitter = /\s[-–—]\s/;
        let startDate = '', endDate = '';
        if (splitter.test(t)) {
            const [start, end] = t.split(splitter);
            startDate = (start || '').trim();
            endDate = (end || '').trim();
        } else {
            startDate = t;
        }
        const range = endDate ? `${startDate} - ${endDate}` : startDate;
        return { range, startDate, endDate, duration };
    }
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const experiences = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length < 2) return;

            let title = texts[0] || '';
            let company = '';
            let dates = '';
            let location = '';
            let parsed = { range: '', startDate: '', endDate: '', duration: '' };
            const used = new Set([0]);

            for (let i = 1; i < texts.length && i < 6; i++) {
                if (isDateLike(texts[i])) {
                    parsed = parseDateRange(texts[i]);
                    dates = parsed.range || texts[i];
                    used.add(i);
                    break;
                }
            }
            for (let i = 1; i < texts.length && i < 6; i++) {
                if (used.has(i)) continue;
                if (!isDateLike(texts[i]) && !isLocationLike(texts[i]) && !isWorkArrangement(texts[i])) {
                    company = texts[i];
                    used.add(i);
                    break;
                }
            }
            if (!company) {
                for (let i = 1; i < texts.length && i < 6; i++) {
                    if (used.has(i)) continue;
                    if (/\b(full.?time|part.?time|contract|freelance|self.?employed|internship|seasonal|apprenticeship)\b/i.test(texts[i])) {
                        company = texts[i];
                        used.add(i);
                        break;
                    }
                }
            }
            for (let i = 1; i < texts.length && i < 6; i++) {
                if (used.has(i)) continue;
                if (isLocationLike(texts[i])) {
                    location = texts[i];
                    used.add(i);
                    break;
                }
            }

            let description = '';
            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) {
                description = (descSpan.innerText || descSpan.textContent || '').trim();
            }

            if (title && !title.startsWith('Someone at') && !title.includes('…')) {
                const exp = { title, company, dates, location, description };
                if (parsed.startDate) exp.from = parsed.startDate;
                if (parsed.endDate) exp.to = parsed.endDate;
                experiences.push(exp);
            }
        } catch (e) { /* ignore */ }
    });

    return experiences;
}

// ─── Education ─────────────────────────────────────────────────

function extractEducationData() {
    // ── Inline helpers ──
    function isDateLike(text) {
        return /\b\d{4}\b/.test(text) || /\bpresent\b/i.test(text);
    }
    function parseDateRange(text) {
        if (!text) return { range: '', startDate: '', endDate: '', duration: '' };
        let t = text.replace(/\s+/g, ' ').trim();
        let duration = '';
        if (t.includes(' · ')) {
            const parts = t.split(' · ');
            t = parts[0].trim();
            duration = parts.slice(1).join(' · ').trim();
        }
        if (!/\b\d{4}\b/.test(t) && !/present/i.test(t)) {
            return { range: '', startDate: '', endDate: '', duration: '' };
        }
        const splitter = /\s[-–—]\s/;
        let startDate = '', endDate = '';
        if (splitter.test(t)) {
            const [start, end] = t.split(splitter);
            startDate = (start || '').trim();
            endDate = (end || '').trim();
        } else {
            startDate = t;
        }
        const range = endDate ? `${startDate} - ${endDate}` : startDate;
        return { range, startDate, endDate, duration };
    }
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const education = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const school = texts[0] || '';
            let degreeText = '';
            let dateText = '';
            let grade = '';

            for (let i = 1; i < texts.length && i < 6; i++) {
                const t = texts[i];
                if (!dateText && isDateLike(t) && !/\bgrade\b/i.test(t)) {
                    dateText = t;
                } else if (!grade && /\bgrade\b/i.test(t)) {
                    grade = t;
                } else if (!degreeText) {
                    degreeText = t;
                }
            }

            let degree = degreeText;
            let field = '';
            if (degreeText.includes(',')) {
                const parts = degreeText.split(',');
                degree = (parts.shift() || '').trim();
                field = parts.join(',').trim();
            }

            const parsed = parseDateRange(dateText);
            const edu = {
                school, degree, field,
                duration: parsed.range || dateText || '',
                description: ''
            };
            if (parsed.startDate) edu.from = parsed.startDate;
            if (parsed.endDate) edu.to = parsed.endDate;

            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) {
                edu.description = (descSpan.innerText || descSpan.textContent || '').trim();
            }

            if (school && !school.startsWith('Someone at') && !school.includes('…')) {
                education.push(edu);
            }
        } catch (e) { /* ignore */ }
    });

    return education;
}

// ─── Certifications ────────────────────────────────────────────

function extractCertificationData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const certifications = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const cert = { name: texts[0] || '', issuer: '', date: '', credentialId: '', url: '' };

            for (let i = 1; i < texts.length && i < 6; i++) {
                const t = texts[i];
                if (/Credential ID/i.test(t)) {
                    cert.credentialId = t.replace(/Credential ID:?\s*/i, '').trim();
                } else if (!cert.date && /Issued|Expires|\d{4}/.test(t)) {
                    cert.date = t;
                } else if (!cert.issuer) {
                    cert.issuer = t;
                }
            }

            const credLink = item.querySelector(
                'a[data-view-name*="license-certifications-see"], ' +
                'a[href*="credential"], a[href*="credly"], a[href*="certificate"]'
            );
            if (credLink) cert.url = credLink.href;

            if (cert.name) certifications.push(cert);
        } catch (e) { /* ignore */ }
    });

    return certifications;
}

// ─── Projects ──────────────────────────────────────────────────

function extractProjectsData() {
    // ── Inline helpers ──
    function isDateLike(text) {
        return /\b\d{4}\b/.test(text) || /\bpresent\b/i.test(text);
    }
    function parseSkillsText(text) {
        if (!text) return [];
        let t = text.replace(/^[\s\S]*?Skills:\s*/i, '').trim();
        t = t.replace(/\s+and\s+\+\d+\s*skills?\s*$/i, '').trim();
        t = t.replace(/,?\s*\+\d+\s*skills?\s*$/i, '').trim();
        const parts = t.split(/\s*[,·•|]\s*/).map(p => p.trim()).filter(Boolean);
        const seen = new Set();
        return parts.filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const projects = [];
    const items = findDetailPageItems();
    const processedTitles = new Set();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const title = texts[0] || '';
            if (processedTitles.has(title)) return;
            processedTitles.add(title);

            let date = '';
            for (let i = 1; i < texts.length && i < 4; i++) {
                if (isDateLike(texts[i])) { date = texts[i]; break; }
            }

            let description = '';
            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) {
                description = (descSpan.innerText || descSpan.textContent || '').trim();
            }

            let url = '';
            const allLinks = item.querySelectorAll('a[href]');
            for (const a of allLinks) {
                const href = a.href || '';
                if (href && !href.includes('linkedin.com/in/') && !href.includes('miniProfile')) {
                    url = href.split('?')[0];
                    break;
                }
            }

            let contextualSkills = [];
            try {
                const skillsContainer = item.querySelector(
                    '[data-view-name*="projects-see-skills"], [data-view-name*="see-skills-button"]'
                );
                if (skillsContainer) {
                    contextualSkills = parseSkillsText((skillsContainer.textContent || '').trim());
                }
                if (!contextualSkills.length) {
                    const full = (item.innerText || '');
                    const mt = full.match(/Skills:\s*(.+?)(?:\r?\n|$)/i);
                    if (mt && mt[1]) contextualSkills = parseSkillsText(mt[1].trim());
                }
            } catch (e) { /* ignore */ }

            if (title && !title.toLowerCase().includes('show all') && !title.toLowerCase().includes('see all')) {
                projects.push({ title, date, description, url, contextual_skills: contextualSkills });
            }
        } catch (e) { /* ignore */ }
    });

    return projects;
}

// ─── Skills ────────────────────────────────────────────────────

function extractSkillsData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    /**
     * Extract association texts from a skill item's sub-components.
     * Returns an array of strings like:
     *   "2 experiences across Cosmic Wire Inc and 1 other company"  (old layout)
     *   "3 experiences at Aize and 2 other companies"               (new SDUI layout)
     *   "Machine Learning Lead at Buyaladdin.com, Inc"              (single experience, new SDUI)
     */
    function getAssociationTexts(item) {
        const associations = [];
        // Old layout: sub-components inside pvs-entity__sub-components
        const subComponents = item.querySelector('.pvs-entity__sub-components');
        if (subComponents) {
            const subItems = subComponents.querySelectorAll('li');
            subItems.forEach(li => {
                const text = (li.textContent || '').replace(/\s+/g, ' ').trim();
                // Match "N experience(s) across/at Company..." or "JobTitle at Company"
                if (/\d+\s*experiences?\s*(across|at)\s/i.test(text)) {
                    associations.push(text);
                } else if (/\bat\b/i.test(text) && !/endorsement/i.test(text) && text.length < 200) {
                    // Single experience association like "Machine Learning Lead at Buyaladdin.com, Inc"
                    associations.push(text);
                }
            });
        }
        // New SDUI layout: look for all visible text nodes that describe experience associations
        if (associations.length === 0) {
            const allSpans = item.querySelectorAll('span');
            const seen = new Set();
            allSpans.forEach(span => {
                // Skip hidden/duplicate aria spans
                if (span.getAttribute('aria-hidden') === 'true') return;
                if (span.classList.contains('visually-hidden')) return;
                const text = (span.textContent || '').replace(/\s+/g, ' ').trim();
                if (seen.has(text)) return;
                seen.add(text);
                if (/\d+\s*experiences?\s*(across|at)\s/i.test(text)) {
                    associations.push(text);
                } else if (/\bat\b/i.test(text) && !/endorsement/i.test(text) &&
                           !/edit\s/i.test(text) && text.length > 5 && text.length < 200) {
                    associations.push(text);
                }
            });
        }
        // Also check aria-hidden="true" spans for old layout (they contain the visible text)
        if (associations.length === 0) {
            const ariaSpans = item.querySelectorAll('span[aria-hidden="true"]');
            ariaSpans.forEach(span => {
                const text = (span.textContent || '').replace(/\s+/g, ' ').trim();
                if (/\d+\s*experiences?\s*(across|at)\s/i.test(text)) {
                    associations.push(text);
                } else if (/\bat\b/i.test(text) && !/endorsement/i.test(text) &&
                           !/edit\s/i.test(text) && text.length > 5 && text.length < 200) {
                    associations.push(text);
                }
            });
        }
        return associations;
    }

    // ── Main logic ──
    const skills = [];
    const seenSkillNames = new Set();
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;

    // Skills page uses specific componentkey: com.linkedin.sdui.profile.skill(...)
    let items = Array.from(main.querySelectorAll('div[componentkey*="com.linkedin.sdui.profile.skill"]'))
        .filter(el => !(el.getAttribute('componentkey') || '').endsWith('-divider'));

    // Deduplicate: outer wrapper contains inner div with same componentkey.
    // Keep only the outermost (those whose parent doesn't also match).
    if (items.length > 0) {
        items = items.filter(el => {
            let parent = el.parentElement;
            while (parent && parent !== main) {
                const pck = parent.getAttribute('componentkey') || '';
                if (pck.includes('com.linkedin.sdui.profile.skill') && !pck.endsWith('-divider')) {
                    return false; // this is the inner div; skip it
                }
                parent = parent.parentElement;
            }
            return true;
        });
    }

    // Fallback: generic item detection
    if (items.length === 0) {
        items = findDetailPageItems();
    }

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const skillName = texts[0] || '';
            if (skillName &&
                !skillName.toLowerCase().includes('endorsement') &&
                !skillName.toLowerCase().includes('edit skill') &&
                skillName.length > 1 &&
                !seenSkillNames.has(skillName)) {
                seenSkillNames.add(skillName);
                const associations = getAssociationTexts(item);
                skills.push({ name: skillName, associations });
            }
        } catch (e) { /* ignore */ }
    });

    return skills;
}

// ─── Profile ───────────────────────────────────────────────────

function extractProfileData() {
    // ── Inline helpers ──
    function isDateLike(text) {
        return /\b\d{4}\b/.test(text) || /\bpresent\b/i.test(text);
    }
    function isLocationLike(text) {
        return text.includes(',') && !/\b\d{4}\b/.test(text) && text.length < 120;
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const extractedData = {
        linkedinUrl: window.location.href.split('?')[0],
        name: '',
        headline: '',
        location: '',
        image: '',
        about: '',
        aboutHtml: '',
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
        volunteer: [],
        languages: [],
        patents: [],
        timestamp: new Date().toISOString()
    };

    // ── Profile Image ──
    const photoImg = document.querySelector('[aria-label="Profile photo"] img') ||
                     document.querySelector('[data-view-name="profile-top-card-member-photo"] img') ||
                     document.querySelector('img[src*="profile-displayphoto-scale_400"]') ||
                     document.querySelector('img[src*="profile-displayphoto"]');
    if (photoImg) {
        extractedData.image = photoImg.src || '';
    }

    // ── Name ──
    const topcard = document.querySelector('section[componentkey*="Topcard"]');
    if (topcard) {
        const h2 = topcard.querySelector('h2');
        if (h2) extractedData.name = h2.textContent.trim();
    }
    if (!extractedData.name) {
        const oldNameSelectors = [
            'h1.text-heading-xlarge', 'h1.inline.t-24', '.pv-text-details__left-panel h1'
        ];
        for (const sel of oldNameSelectors) {
            const elem = document.querySelector(sel);
            if (elem && elem.textContent.trim()) { extractedData.name = elem.textContent.trim(); break; }
        }
    }
    if (!extractedData.name) {
        const mainArea = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
        const sectionTitles = new Set([
            'About', 'Experience', 'Education', 'Skills', 'Featured', 'Analytics',
            'Suggested for you', 'Activity', 'Interests', 'Licenses & certifications',
            'Honors & awards', 'Languages', 'Projects', 'Publications',
            'Volunteer experience', 'Patents'
        ]);
        const h2s = mainArea.querySelectorAll('h2');
        for (const h2 of h2s) {
            const text = h2.textContent.trim();
            if (sectionTitles.has(text)) continue;
            if (/notification/i.test(text)) continue;
            if (text.length > 1 && text.length < 100) { extractedData.name = text; break; }
        }
    }

    // ── Headline ──
    if (topcard) {
        const allPs = Array.from(topcard.querySelectorAll('p'));
        for (const p of allPs) {
            const text = p.textContent.trim();
            if (text.length < 10) continue;
            if (p.closest('button') || p.closest('a')) continue;
            if (text === extractedData.name) continue;
            if (text.includes('connection') || text.includes('Contact info')) continue;
            if (text.length > 15) { extractedData.headline = text; break; }
        }
    }
    if (!extractedData.headline) {
        const headlineSelectors = ['.text-body-medium.break-words', 'div.text-body-medium'];
        for (const sel of headlineSelectors) {
            const elem = document.querySelector(sel);
            if (elem && elem.textContent.trim()) { extractedData.headline = elem.textContent.trim(); break; }
        }
    }

    // ── Location ──
    if (topcard) {
        const allPs = Array.from(topcard.querySelectorAll('p'));
        for (const p of allPs) {
            const text = p.textContent.trim();
            if (p.closest('button') || p.closest('a')) continue;
            if (text.includes(',') && text.length < 60 &&
                text !== extractedData.headline && text !== extractedData.name) {
                extractedData.location = text;
                break;
            }
        }
    }
    if (!extractedData.location) {
        const locSelectors = [
            '.text-body-small.inline.t-black--light.break-words', 'span.text-body-small'
        ];
        for (const sel of locSelectors) {
            const elem = document.querySelector(sel);
            if (elem && elem.textContent.trim() && !elem.textContent.includes('Contact info')) {
                extractedData.location = elem.textContent.trim();
                break;
            }
        }
    }

    // ── About Section ──
    const sections = document.querySelectorAll('section[componentkey]');
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const sectionTitle = h2 ? h2.textContent.trim() : '';

        if (ck.includes('About') || sectionTitle === 'About') {
            const aboutText = section.querySelector('[data-testid="expandable-text-box"]');
            if (aboutText) {
                extractedData.about = (aboutText.innerText || aboutText.textContent || '').trim();
                try {
                    const clone = aboutText.cloneNode(true);
                    let html = clone.innerHTML || '';
                    html = html.replace(/\u00A0/g, ' ').trim();
                    extractedData.aboutHtml = html;
                } catch (e) { extractedData.aboutHtml = extractedData.about; }
            } else {
                const ps = section.querySelectorAll('p');
                for (const p of ps) {
                    const text = (p.textContent || '').trim();
                    if (text.length > 50 && text !== sectionTitle && !p.closest('button')) {
                        extractedData.about = text;
                        break;
                    }
                }
            }
            break;
        }
    }
    if (!extractedData.about) {
        const aboutSection = document.querySelector('#about');
        if (aboutSection) {
            const aboutContainer = aboutSection.closest('section');
            if (aboutContainer) {
                const aboutText = aboutContainer.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more');
                if (aboutText) extractedData.about = aboutText.textContent.trim();
            }
        }
    }

    // ── Experience section (preview on profile page) ──
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        if (ck.includes('Experience') || title === 'Experience') {
            const expItems = section.querySelectorAll('div[componentkey^="entity-collection-item"]');
            expItems.forEach(expItem => {
                try {
                    const texts = getMetadataParagraphs(expItem);
                    if (texts.length < 2) return;
                    const exp = { title: texts[0] || '', company: '', duration: '', location: '', description: '' };
                    for (let i = 1; i < texts.length && i < 5; i++) {
                        if (isDateLike(texts[i]) && !exp.duration) exp.duration = texts[i];
                        else if (isLocationLike(texts[i]) && !exp.location) exp.location = texts[i];
                        else if (!exp.company) exp.company = texts[i];
                    }
                    const desc = expItem.querySelector('[data-testid="expandable-text-box"]');
                    if (desc) exp.description = (desc.innerText || desc.textContent || '').trim();
                    if (exp.title) extractedData.experience.push(exp);
                } catch (e) { /* ignore */ }
            });
            break;
        }
    }

    // ── Education section (preview on profile page) ──
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        if (ck.includes('Education') || title === 'Education') {
            const eduItems = section.querySelectorAll('div[componentkey^="entity-collection-item"]');
            eduItems.forEach(eduItem => {
                try {
                    const texts = getMetadataParagraphs(eduItem);
                    if (texts.length === 0) return;
                    const edu = { school: texts[0] || '', degree: '', field: '', duration: '', description: '' };
                    for (let i = 1; i < texts.length && i < 5; i++) {
                        if (isDateLike(texts[i]) && !edu.duration) edu.duration = texts[i];
                        else if (!edu.degree) {
                            const dt = texts[i];
                            if (dt.includes(',')) {
                                const parts = dt.split(',');
                                edu.degree = (parts.shift() || '').trim();
                                edu.field = parts.join(',').trim();
                            } else {
                                edu.degree = dt;
                            }
                        }
                    }
                    if (edu.school) extractedData.education.push(edu);
                } catch (e) { /* ignore */ }
            });
            break;
        }
    }

    // ── Skills section (preview on profile page) ──
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        if (ck.includes('Skills') || title === 'Skills') {
            const skillItems = section.querySelectorAll('div[componentkey^="entity-collection-item"]');
            skillItems.forEach(skillItem => {
                try {
                    const texts = getMetadataParagraphs(skillItem);
                    if (texts.length > 0 && texts[0]) {
                        const name = texts[0];
                        if (!name.toLowerCase().includes('endorsement') && name.length > 1) {
                            extractedData.skills.push(name);
                        }
                    }
                } catch (e) { /* ignore */ }
            });
            extractedData.skills = [...new Set(extractedData.skills)];
            break;
        }
    }

    // ── Certifications section (preview on profile page) ──
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        if (ck.includes('Certification') || ck.includes('License') ||
            title === 'Licenses & certifications' || title === 'Certifications') {
            const certItems = section.querySelectorAll('div[componentkey^="entity-collection-item"]');
            certItems.forEach(certItem => {
                try {
                    const texts = getMetadataParagraphs(certItem);
                    if (texts.length > 0) {
                        const cert = {
                            name: texts[0] || '',
                            issuer: texts[1] || '',
                            date: texts.find(s => /\d{4}|Issued/.test(s)) || ''
                        };
                        if (cert.name) extractedData.certifications.push(cert);
                    }
                } catch (e) { /* ignore */ }
            });
            break;
        }
    }

    // ── Patents section (preview on profile page) ──
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';

        if (ck.includes('Patent') || title === 'Patents') {
            const patentItems = section.querySelectorAll('div[componentkey^="entity-collection-item"]');
            patentItems.forEach(patentItem => {
                try {
                    const texts = getMetadataParagraphs(patentItem);
                    if (texts.length > 0) {
                        const patent = { title: texts[0] || '', number: '', issuer: '', date: '', url: '', description: '' };
                        for (let i = 1; i < texts.length && i < 5; i++) {
                            const t = texts[i];
                            if (/\d{4}/.test(t) && !patent.date) patent.date = t;
                        }
                        const descSpan = patentItem.querySelector('[data-testid="expandable-text-box"]');
                        if (descSpan) patent.description = (descSpan.innerText || descSpan.textContent || '').trim();
                        if (patent.title) extractedData.patents.push(patent);
                    }
                } catch (e) { /* ignore */ }
            });
            break;
        }
    }

    return extractedData;
}

// ─── Volunteering ──────────────────────────────────────────────

function extractVolunteeringData() {
    // ── Inline helpers ──
    function isDateLike(text) {
        return /\b\d{4}\b/.test(text) || /\bpresent\b/i.test(text);
    }
    function parseDateRange(text) {
        if (!text) return { range: '', startDate: '', endDate: '', duration: '' };
        let t = text.replace(/\s+/g, ' ').trim();
        let duration = '';
        if (t.includes(' · ')) {
            const parts = t.split(' · ');
            t = parts[0].trim();
            duration = parts.slice(1).join(' · ').trim();
        }
        if (!/\b\d{4}\b/.test(t) && !/present/i.test(t)) {
            return { range: '', startDate: '', endDate: '', duration: '' };
        }
        const splitter = /\s[-–—]\s/;
        let startDate = '', endDate = '';
        if (splitter.test(t)) {
            const [start, end] = t.split(splitter);
            startDate = (start || '').trim();
            endDate = (end || '').trim();
        } else {
            startDate = t;
        }
        const range = endDate ? `${startDate} - ${endDate}` : startDate;
        return { range, startDate, endDate, duration };
    }
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const volunteering = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length < 2) return;

            const vol = { role: texts[0] || '', organization: '', date: '', duration: '', cause: '', description: '' };
            const used = new Set([0]);

            for (let i = 1; i < texts.length && i < 6; i++) {
                if (isDateLike(texts[i])) {
                    const parsed = parseDateRange(texts[i]);
                    vol.date = parsed.range || texts[i];
                    vol.duration = parsed.duration || '';
                    used.add(i);
                    break;
                }
            }
            for (let i = 1; i < texts.length && i < 6; i++) {
                if (used.has(i)) continue;
                if (!isDateLike(texts[i])) { vol.organization = texts[i]; used.add(i); break; }
            }
            for (let i = 1; i < texts.length && i < 6; i++) {
                if (used.has(i)) continue;
                if (!isDateLike(texts[i]) && texts[i].length < 50) { vol.cause = texts[i]; used.add(i); break; }
            }

            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) vol.description = (descSpan.innerText || descSpan.textContent || '').trim();

            if (vol.role && !vol.role.startsWith('Someone at')) volunteering.push(vol);
        } catch (e) { /* ignore */ }
    });

    return volunteering;
}

// ─── Publications ──────────────────────────────────────────────

function extractPublicationsData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const publications = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const pub = { title: texts[0] || '', publisher: '', date: '', description: '', url: '' };

            for (let i = 1; i < texts.length && i < 4; i++) {
                const t = texts[i];
                if (t.includes('·')) {
                    const parts = t.split('·').map(s => s.trim());
                    const datePart = parts.find(p => /\d{4}/.test(p));
                    const pubPart = parts.find(p => p !== datePart);
                    if (datePart && !pub.date) pub.date = datePart;
                    if (pubPart && !pub.publisher) pub.publisher = pubPart;
                } else if (/\d{4}/.test(t) && !pub.date) {
                    pub.date = t;
                } else if (!pub.publisher) {
                    pub.publisher = t;
                }
            }

            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) pub.description = (descSpan.innerText || descSpan.textContent || '').trim();

            const showPub = item.querySelector('a[data-view-name*="publication"]');
            if (showPub) pub.url = showPub.href;
            if (!pub.url) {
                const links = item.querySelectorAll('a[href]');
                for (const a of links) {
                    const href = a.href || '';
                    if (href && !href.includes('linkedin.com/in/') && !href.includes('miniProfile')) {
                        pub.url = href;
                        break;
                    }
                }
            }

            if (pub.title && !pub.title.startsWith('Someone at')) publications.push(pub);
        } catch (e) { /* ignore */ }
    });

    return publications;
}

// ─── Honors ────────────────────────────────────────────────────

function extractHonorsData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const honors = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const honor = { title: texts[0] || '', issuer: '', date: '', associated_with: '', description: '' };

            for (let i = 1; i < texts.length && i < 6; i++) {
                const t = texts[i];
                if (t.startsWith('Associated with')) {
                    honor.associated_with = t.replace(/^Associated with\s*/i, '').trim();
                } else if (t.includes('Issued by') || t.includes('·')) {
                    if (t.includes('·')) {
                        const parts = t.split('·').map(s => s.trim());
                        const datePart = parts.find(p => /\d{4}/.test(p));
                        const issuerPart = parts.find(p => p.includes('Issued by'));
                        if (datePart) honor.date = datePart;
                        if (issuerPart) honor.issuer = issuerPart.replace(/^Issued by\s*/i, '').trim();
                        else {
                            const other = parts.find(p => p !== datePart);
                            if (other) honor.issuer = other.replace(/^Issued by\s*/i, '').trim();
                        }
                    } else {
                        honor.issuer = t.replace(/^Issued by\s*/i, '').trim();
                    }
                } else if (/\d{4}/.test(t) && !honor.date) {
                    honor.date = t;
                }
            }

            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) honor.description = (descSpan.innerText || descSpan.textContent || '').trim();

            if (honor.title && !honor.title.startsWith('Someone at')) honors.push(honor);
        } catch (e) { /* ignore */ }
    });

    return honors;
}

// ─── Languages ─────────────────────────────────────────────────

function extractLanguagesData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const languages = [];
    const items = findDetailPageItems();

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const name = texts[0] || '';
            if (name && name.length > 1 &&
                !name.toLowerCase().includes('viewer') &&
                !name.toLowerCase().includes('private to you') &&
                !name.toLowerCase().includes('edit language')) {
                languages.push(name);
            }
        } catch (e) { /* ignore */ }
    });

    return [...new Set(languages)];
}

// ─── Patents ───────────────────────────────────────────────────

function extractPatentsData() {
    // ── Inline helpers ──
    function findDetailPageItems() {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        // Strategy 1: entity-collection-item componentkey (experiences page)
        let items = Array.from(main.querySelectorAll('div[componentkey^="entity-collection-item"]'));
        if (items.length > 1) return items;
        // Strategy 2: edit-button-trace to unique componentkeys (education, skills)
        const editBtns = main.querySelectorAll('button[aria-label^="Edit "]');
        const itemSet = new Set();
        editBtns.forEach(btn => {
            let el = btn.parentElement;
            while (el && el !== main) {
                if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                el = el.parentElement;
            }
        });
        if (itemSet.size > 1) return Array.from(itemSet);
        // Strategy 3: HR-splitting inside lazy-column content area
        const lazyCol = main.querySelector('[data-testid="lazy-column"]');
        if (lazyCol) {
            const children = Array.from(lazyCol.children);
            const contentChild = children.find(c => c.querySelectorAll('hr').length > 0);
            if (contentChild) {
                const firstHr = contentChild.querySelector('hr');
                const hrContainer = firstHr.parentElement;
                const containerChildren = Array.from(hrContainer.children);
                const segments = [];
                let currentSegment = [];
                for (const child of containerChildren) {
                    if (child.tagName === 'HR') {
                        if (currentSegment.length > 0) segments.push(currentSegment[0]);
                        currentSegment = [];
                    } else {
                        currentSegment.push(child);
                    }
                }
                if (currentSegment.length > 0) segments.push(currentSegment[0]);
                if (segments.length > 1) return segments;
            }
        }
        // Strategy 4: role="listitem" inside lazy-column
        if (lazyCol) {
            const listItems = Array.from(lazyCol.querySelectorAll('[role="listitem"]'));
            if (listItems.length > 1) return listItems;
        }
        // Last resort: return whatever edit-button-trace found (even if 1)
        if (itemSet.size > 0) return Array.from(itemSet);
        return [];
    }
    function getMetadataParagraphs(item) {
        return Array.from(item.querySelectorAll('p'))
            .filter(p => {
                if (p.querySelector('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('[data-testid="expandable-text-box"]')) return false;
                if (p.closest('button')) return false;
                if (p.closest('[data-view-name*="skills-button"]')) return false;
                if (p.closest('[data-view-name*="see-skills"]')) return false;
                if (p.closest('[data-view-name*="thumbnail"]')) return false;
                const innerA = p.querySelector('a');
                if (innerA) {
                    const dvn = innerA.getAttribute('data-view-name') || '';
                    if (dvn.includes('skills')) return false;
                    const txt = (innerA.textContent || '').trim();
                    if (/\d+\s*skills?\s*$/i.test(txt)) return false;
                    const lower = txt.toLowerCase();
                    if (lower === 'show publication' || lower === 'show credential') return false;
                }
                const text = (p.textContent || '').trim();
                if (text === 'Other authors') return false;
                return true;
            })
            .map(p => (p.textContent || '').trim())
            .filter(t => t.length > 0 && t.length < 500 && t !== '·' && t !== '|');
    }

    // ── Main logic ──
    const patents = [];

    // First: look for a patents section via componentkey (profile page)
    let items = [];
    const sections = document.querySelectorAll('section[componentkey]');
    for (const section of sections) {
        const ck = section.getAttribute('componentkey') || '';
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : '';
        if (ck.includes('Patent') || title === 'Patents') {
            items = Array.from(section.querySelectorAll('div[componentkey^="entity-collection-item"]'));
            // If no entity-collection-item, try HR-splitting within section
            if (items.length === 0) {
                const hrs = section.querySelectorAll('hr');
                if (hrs.length > 0) {
                    const hrContainer = hrs[0].parentElement;
                    const containerChildren = Array.from(hrContainer.children);
                    const segments = [];
                    let currentSegment = [];
                    for (const child of containerChildren) {
                        if (child.tagName === 'HR') {
                            if (currentSegment.length > 0) segments.push(currentSegment[0]);
                            currentSegment = [];
                        } else {
                            currentSegment.push(child);
                        }
                    }
                    if (currentSegment.length > 0) segments.push(currentSegment[0]);
                    if (segments.length > 0) items = segments;
                }
            }
            // If still no items, try edit-button-trace within section
            if (items.length === 0) {
                const editBtns = section.querySelectorAll('button[aria-label^="Edit "]');
                const itemSet = new Set();
                editBtns.forEach(btn => {
                    let el = btn.parentElement;
                    while (el && el !== section) {
                        if (el.getAttribute('componentkey')) { itemSet.add(el); break; }
                        el = el.parentElement;
                    }
                });
                if (itemSet.size > 0) items = Array.from(itemSet);
            }
            // Last resort: use all paragraphs in section as a single item
            if (items.length === 0) {
                const ps = section.querySelectorAll('p');
                if (ps.length > 0) items = [section];
            }
            break;
        }
    }

    // Fallback: generic detection (patent details page)
    if (items.length === 0) {
        // Only use findDetailPageItems if we're on a patent-specific SDUI page
        const patentScreen = document.querySelector('[data-sdui-screen*="Patent"]');
        if (patentScreen) {
            items = findDetailPageItems();
        }
    }

    // Fallback: filter generic items for patent-related content
    if (items.length === 0) {
        let genericItems = findDetailPageItems();
        const filtered = genericItems.filter(item => {
            const labels = Array.from(item.querySelectorAll('[aria-label]'))
                .map(el => (el.getAttribute('aria-label') || '').toLowerCase()).join(' ');
            const links = Array.from(item.querySelectorAll('a'))
                .map(a => (a.href || '').toLowerCase()).join(' ');
            return labels.includes('patent') || links.includes('patent') ||
                   links.includes('google.com/patents');
        });
        if (filtered.length > 0) items = filtered;
    }

    // Fallback: old DOM #patents
    if (items.length === 0) {
        const patentsSection = document.querySelector('#patents');
        if (patentsSection) {
            const patentsContainer = patentsSection.closest('section');
            if (patentsContainer) {
                items = Array.from(patentsContainer.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item'));
            }
        }
    }

    items.forEach(item => {
        try {
            const texts = getMetadataParagraphs(item);
            if (texts.length === 0) return;

            const patent = { title: texts[0] || '', number: '', issuer: '', date: '', url: '', description: '' };

            if (patent.title.includes(' - ')) {
                const parts = patent.title.split(' - ');
                if (parts[0] && /^[A-Z]{2}\d+[A-Z]?\d*$/i.test(parts[0].trim())) {
                    patent.number = parts[0].trim();
                    patent.title = parts.slice(1).join(' - ').trim();
                }
            }

            for (let i = 1; i < texts.length && i < 5; i++) {
                const t = texts[i];
                if (t.includes('·')) {
                    const parts = t.split('·').map(s => s.trim());
                    parts.forEach(part => {
                        if (/^[A-Z]{2}\s*\d+[A-Z]?\d*$/i.test(part) && !patent.number) {
                            patent.number = part;
                        } else if (/\d{4}/.test(part)) {
                            patent.date = part;
                        } else if (/issued|patent/i.test(part)) {
                            patent.issuer = part;
                        }
                    });
                } else if (/\d{4}/.test(t) && !patent.date) {
                    patent.date = t;
                } else if (/issued|patent/i.test(t)) {
                    patent.issuer = t;
                }
            }

            const descSpan = item.querySelector('[data-testid="expandable-text-box"]');
            if (descSpan) {
                patent.description = (descSpan.innerText || descSpan.textContent || '').trim();
            } else {
                const long = texts.find(s => s.length > 30 && s !== patent.title);
                if (long) patent.description = long;
            }

            const link = item.querySelector('a[href*="patent"], a[href*="google.com/patents"]');
            if (link) patent.url = link.href;

            if (patent.title && !patent.title.startsWith('Someone at') &&
                !patent.title.toLowerCase().includes('show all')) {
                patents.push(patent);
            }
        } catch (e) { /* ignore */ }
    });

    return patents;
}

module.exports = {
    extractExperienceData,
    extractEducationData,
    extractCertificationData,
    extractProjectsData,
    extractSkillsData,
    extractProfileData,
    extractVolunteeringData,
    extractPublicationsData,
    extractHonorsData,
    extractLanguagesData,
    extractPatentsData
};
