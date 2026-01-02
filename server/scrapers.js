/**
 * Extraction functions for LinkedIn data.
 * These are designed to be run inside page.evaluate().
 */

/**
 * Extract experience data from LinkedIn details/experience page
 */
function extractExperienceData() {
    const experiences = [];
    const mainContent = document.querySelector('main') || document.body;
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            // Get all visible text spans
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0 && !t.includes('Someone at'));

            if (allSpans.length < 2) return; // Need at least title and company

            // First span is usually title, second is company with employment type
            const title = allSpans[0] || '';
            const companyLine = allSpans[1] || '';
            // Find dates (contains year or "Present") with robust parsing
            // Prefer a line that contains a range and possibly duration ("· 2 yrs 3 mos")
            const dateCandidates = [];
            const rawMeta = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim();
            if (rawMeta) dateCandidates.push(rawMeta);
            // Add all spans that look like they contain dates
            allSpans.forEach(s => {
                if (/\d{4}/.test(s) || /present/i.test(s)) {
                    dateCandidates.push(s);
                }
            });

            // De-duplicate while preserving order
            const seen = new Set();
            const uniqueCandidates = dateCandidates.filter(s => {
                if (seen.has(s)) return false;
                seen.add(s);
                return true;
            });

            // Helper: normalize a candidate into a clean date range and optional parts
            function parseDateRange(text) {
                if (!text) return { range: '', startDate: '', endDate: '', duration: '' };
                // Remove excessive whitespace
                let t = text.replace(/\s+/g, ' ').trim();
                // Split off duration if present (e.g., " · 2 yrs 3 mos")
                let duration = '';
                if (t.includes(' · ')) {
                    const parts = t.split(' · ');
                    t = parts[0].trim();
                    duration = parts.slice(1).join(' · ').trim();
                }
                // Accept only strings that look like a range or a single year/month-year
                const hasYear = /\b\d{4}\b/.test(t);
                if (!hasYear && !/present/i.test(t)) return { range: '', startDate: '', endDate: '', duration: '' };
                // Split on common dash characters
                const splitter = /\s[-–—]\s/; // space dash space
                let startDate = '', endDate = '';
                if (splitter.test(t)) {
                    const [start, end] = t.split(splitter);
                    startDate = (start || '').trim();
                    endDate = (end || '').trim();
                } else {
                    // No explicit range, treat as single date
                    startDate = t;
                }
                const range = endDate ? `${startDate} - ${endDate}` : startDate;
                return { range, startDate, endDate, duration };
            }

            let parsed = { range: '', startDate: '', endDate: '', duration: '' };
            for (const cand of uniqueCandidates) {
                const p = parseDateRange(cand);
                // Heuristic: prefer candidates that yield a non-empty range and have a year
                if (p.range && (/\d{4}/.test(p.range) || /present/i.test(p.range))) {
                    parsed = p;
                    break;
                }
            }
            const dates = parsed.range || '';

            // Find location (has comma, no years, not too long)
            const location = allSpans.find(s =>
                s.includes(',') &&
                !/\d{4}/.test(s) &&
                s.length < 100 &&
                s !== title &&
                s !== companyLine
            ) || '';

            // Description: prefer structured sub-components and preserve line breaks
            let description = '';
            try {
                const sub = item.querySelector('.pvs-entity__sub-components');
                if (sub) {
                    const rowItems = Array.from(sub.querySelectorAll('li.pvs-list__item--with-top-padding'));
                    // Identify index of first skills row
                    const skillsIndex = rowItems.findIndex(li => /\bSkills:\b/i.test(li.textContent || ''));
                    const candidateRows = (skillsIndex === -1 ? rowItems : rowItems.slice(0, skillsIndex))
                        .filter(li => !li.querySelector('a.optional-action-target-wrapper'));
                    const parts = [];
                    for (const li of candidateRows) {
                        const span = li.querySelector('span[aria-hidden="true"]');
                        const lines = (span?.innerText || span?.textContent || li.innerText || li.textContent || '')
                            .replace(/\r\n?/g, '\n')
                            .split('\n')
                            // Preserve empty lines; trim only trailing spaces
                            .map(s => s.replace(/\s+$/,''));
                        const text = lines.join('\n');
                        if (!text) continue;
                        if (/\bSkills:\b/i.test(text)) continue;
                        if (text === title || text === companyLine || text === dates || text === location) continue;
                        parts.push(text);
                    }
                    if (parts.length) {
                        description = parts.join('\n').trim();
                    }
                }
            } catch (e) { /* ignore */ }

            if (!description) {
                const descContainer = item.querySelector('.inline-show-more-text, .pvs-list__outer-container');
                if (descContainer) {
                    const raw = (descContainer.innerText || descContainer.textContent || '').replace(/\r\n?/g, '\n');
                    const lines = raw
                        .split('\n')
                        // Preserve empty lines; trim only trailing spaces
                        .map(s => s.replace(/\s+$/,''));
                    description = lines.join('\n');
                } else {
                    // Fallback: longest non-metadata line
                    const longText = allSpans.find(s =>
                        s.length > 50 &&
                        s !== title &&
                        s !== companyLine &&
                        s !== dates &&
                        s !== location
                    );
                    if (longText) description = longText;
                }
            }

            // Ensure description does not include a trailing Skills: label (skills are extracted separately)
            if (description && /Skills:/i.test(description)) {
                const cut = description.search(/Skills:/i);
                if (cut !== -1) description = description.slice(0, cut).trim();
            }

            // Contextual skills (if present under sub-components)
            let contextualSkills = [];
            try {
                const skillSpan = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                    .find(s => /\bSkills:\b/i.test(s.textContent));
                if (skillSpan) {
                    const text = skillSpan.textContent.replace(/^[\s\S]*?Skills:\s*/i, '').trim();
                    const parts = text.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                    const seen = new Set();
                    contextualSkills = parts.filter(p => {
                        const key = p.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }
                // Fallback: parse any row that includes the "Skills:" label (not always under `.pvs-entity__sub-components`)
                if (!contextualSkills.length) {
                    const rows = Array.from(item.querySelectorAll('.display-flex.align-items-center.t-14.t-normal.t-black'))
                        .filter(row => /\bSkills:\b/i.test(row.textContent));
                    for (const row of rows) {
                        const strong = row.querySelector('strong');
                        const container = strong ? strong.parentElement : row;
                        const raw = (container?.textContent || '').replace(/\s+/g, ' ').trim();
                        const m = raw.match(/Skills:\s*(.*)$/i);
                        if (m) {
                            const stripped = m[1].trim();
                            const parts = stripped.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                            const seen = new Set();
                            const tokens = parts.filter(p => {
                                const key = p.toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            if (tokens.length) {
                                contextualSkills = tokens;
                                break;
                            }
                        }
                    }
                }
                // Final fallback: any strong element with 'Skills:' inside the item
                if (!contextualSkills.length) {
                    const labels = Array.from(item.querySelectorAll('strong'))
                        .filter(el => /\bSkills:\b/i.test(el.textContent || ''));
                    for (const strong of labels) {
                        const raw = (strong.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
                        const m = raw.match(/Skills:\s*(.*)$/i);
                        if (m) {
                            const stripped = m[1].trim();
                            const parts = stripped.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                            const seen = new Set();
                            const tokens = parts.filter(p => {
                                const key = p.toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            if (tokens.length) {
                                contextualSkills = tokens;
                                break;
                            }
                        }
                    }
                }

                // Text-based fallback: search entire item text for 'Skills:' and parse following tokens
                if (!contextualSkills.length) {
                    const text = (item.innerText || item.textContent || '').trim();
                    const mt = text.match(/Skills:\s*(.+?)(?:\r?\n|$)/i);
                    if (mt && mt[1]) {
                        const parts = mt[1].trim().split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                        const seen = new Set();
                        contextualSkills = parts.filter(p => {
                            const key = p.toLowerCase();
                            if (seen.has(key)) return false;
                            if (/\bSkills:\b/i.test(p) || p.includes(' - ')) return false;
                            seen.add(key);
                            return true;
                        });
                    }
                }
            } catch (e) {
                // ignore skills extraction errors
            }

            // Filter out viewer data
            const isViewerData =
                title.startsWith('Someone at') ||
                companyLine.startsWith('Someone at') ||
                title.includes('…') ||
                (!dates && !companyLine);

            if (!isViewerData && title) {
                const exp = {
                    title,
                    company: companyLine,
                    dates,
                    location,
                        description,
                        contextual_skills: contextualSkills
                };
                // Provide raw from/to dates instead of duration
                if (parsed.startDate) exp.from = parsed.startDate;
                if (parsed.endDate) exp.to = parsed.endDate;
                experiences.push(exp);
            }
        } catch (e) {
            console.error('Error extracting experience item:', e);
        }
    });

    return experiences;
}

/**
 * Extract education data from LinkedIn details/education page
 */
function extractEducationData() {
    const education = [];

    // Only select items from the main content area, not from "Who viewed" sidebar
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    const items = mainContent.querySelectorAll('.pvs-list__item--line-separated, li.pvs-list__paged-list-item');

    items.forEach((item) => {
        try {
            // Prefer bold school name
            const schoolElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            // Prefer non "t-black--light" for degree (to avoid picking the date row)
            const degreeElem = item.querySelector('.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]');
            const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => (s.textContent || '').trim())
                .filter(t => t && t.length > 0);

            // Helper: parse date range like "2015 - 2020" or "Sep 2015 - Jun 2020 · 4 yrs"
            function parseDateRange(text) {
                if (!text) return { range: '', startDate: '', endDate: '' };
                let t = text.replace(/\s+/g, ' ').trim();
                // Drop trailing duration if present
                if (t.includes(' · ')) t = t.split(' · ')[0].trim();
                // If it doesn't look like a date, bail
                if (!/(\b\d{4}\b|present)/i.test(t)) return { range: '', startDate: '', endDate: '' };
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
                return { range, startDate, endDate };
            }

            // Collect date candidates: explicit date element, plus any span with a year/Present
            const dateCandidates = [];
            const rawMeta = dateElem?.textContent?.trim();
            if (rawMeta) dateCandidates.push(rawMeta);
            for (const s of allSpans) {
                if (/\d{4}/.test(s) || /present/i.test(s)) dateCandidates.push(s);
            }
            // De-duplicate while preserving order
            const seen = new Set();
            const uniqueCandidates = dateCandidates.filter(s => {
                if (seen.has(s)) return false;
                seen.add(s);
                return true;
            });
            let parsed = { range: '', startDate: '', endDate: '' };
            for (const cand of uniqueCandidates) {
                const p = parseDateRange(cand);
                if (p.range) { parsed = p; break; }
            }

            // Degree + field
            const degreeText = degreeElem?.textContent?.trim() || allSpans.find(s => s && !/(\b\d{4}\b|present)/i.test(s) && s !== (schoolElem?.textContent?.trim() || '')) || '';
            let degree = degreeText;
            let field = '';
            if (degreeText.includes(',')) {
                const parts = degreeText.split(',');
                degree = (parts.shift() || '').trim();
                field = parts.join(',').trim();
            }

            const edu = {
                school: schoolElem?.textContent?.trim() || allSpans[0] || '',
                degree,
                field,
                duration: parsed.range || '',
                description: ''
            };
            if (parsed.startDate) edu.from = parsed.startDate;
            if (parsed.endDate) edu.to = parsed.endDate;

            // Filter out viewer data (same logic as experiences)
            const isViewerData =
                edu.school.startsWith('Someone at') ||
                edu.degree.startsWith('Someone at') ||
                edu.school.includes('…') ||
                edu.school.includes('...') ||
                (edu.school.match(/\bat\b/i) && !edu.degree && !edu.duration) ||
                (!edu.duration && !edu.degree && edu.school);

            if (edu.school && !isViewerData) {
                education.push(edu);
            }
        } catch (e) {
            // Ignore
        }
    });

    return education;
}

/**
 * Extract certification data from LinkedIn details/certifications page
 */
function extractCertificationData() {
    const certifications = [];
    const items = document.querySelectorAll('.pvs-list__item, li.pvs-list__paged-list-item, li.artdeco-list__item, li.pvs-list__item--line-separated');

    items.forEach((item) => {
        try {
            const nameElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"]') ||
                item.querySelector('span.t-bold span[aria-hidden="true"]') ||
                item.querySelector('.pvs-entity__path span[aria-hidden="true"]');
            const issuerElem = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
            const dateElem = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0 && t.length < 500);

            const cert = {
                name: nameElem?.textContent?.trim() || allSpans[0] || '',
                issuer: issuerElem?.textContent?.trim() || allSpans[1] || '',
                date: '',
                credentialId: '',
                url: ''
            };

            const dateSpan = dateElem?.textContent?.trim() || allSpans.find(s => /\d{4}|Issued|Expires/i.test(s));
            if (dateSpan) cert.date = dateSpan;

            const credentialSpan = allSpans.find(s => /Credential ID|ID:/i.test(s));
            if (credentialSpan) {
                cert.credentialId = credentialSpan.replace(/Credential ID:?/i, '').trim();
            }

            const link = item.querySelector('a[href*="credential"], a[href*="credly"], a[href*="certificate"]');
            if (link) cert.url = link.href;

            if (cert.name || cert.issuer) {
                certifications.push(cert);
            }
        } catch (e) {
            // Ignore
        }
    });

    return certifications;
}

/**
 * Extract projects data from LinkedIn details/projects page
 */
function extractProjectsData() {
    const projects = [];
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;

    // Get ALL list items to be safe
    // Get ALL list items with specific classes (avoid generic li which picks up nested items)
    const items = Array.from(mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated'));

    // console.log(`[Browser] Found ${items.length} total LI elements in main content`);

    const processedTitles = new Set();

    items.forEach((item, index) => {
        try {
            const fullText = item.innerText.trim();
            if (fullText.length < 5) return; // Skip empty items

            // Strategy: Text-based parsing (most reliable for variable DOM)
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

            if (lines.length === 0) return;

            // Assumption: 1st line is Title
            let title = lines[0];

            // Assumption: Date is usually 2nd line, or contains year
            let date = '';
            const dateLineIndex = lines.findIndex(l =>
                /\d{4}/.test(l) &&
                (l.includes('Present') || l.includes(' - ') || l.match(/^[a-zA-Z]{3} \d{4}$/) || l.match(/^\d{4}$/))
            );

            if (dateLineIndex > 0 && dateLineIndex <= 2) {
                date = lines[dateLineIndex];
            }

            // Deduplicate
            if (processedTitles.has(title)) return;
            processedTitles.add(title);

            // Link
            let url = '';
            const linkElem = item.querySelector('a.app-aware-link') || item.querySelector('a[href*="linkedin.com/redir"]');
            if (linkElem) {
                const href = linkElem.href;
                if (!href.includes('miniProfile')) url = href.split('?')[0];
            }

            // Description: text between the top title and the Skills row
            let description = '';
            try {
                // Prefer structured sub-components if available
                const sub = item.querySelector('.pvs-entity__sub-components');
                if (sub) {
                    const rowItems = Array.from(sub.querySelectorAll('li.pvs-list__item--with-top-padding'));
                    // Find index of the first skills row
                    const skillsIndex = rowItems.findIndex(li => /\bSkills:\b/i.test(li.textContent || ''));
                    // Consider rows before the skills row (or all rows if none)
                    const candidateRows = (skillsIndex === -1 ? rowItems : rowItems.slice(0, skillsIndex))
                        // Skip link/thumbnail rows
                        .filter(li => !li.querySelector('a.optional-action-target-wrapper'));

                    const parts = [];
                    for (const li of candidateRows) {
                        const span = li.querySelector('span[aria-hidden="true"]');
                        const text = (span?.innerText || span?.textContent || li.innerText || li.textContent || '')
                            .replace(/\r\n?/g, '\n')
                            .split('\n')
                            .map(s => s.trim())
                            .filter(Boolean)
                            .join('\n');
                        if (!text) continue;
                        if (/\bSkills:\b/i.test(text)) continue;
                        // Avoid repeating the title or date
                        if (text === title || text === date) continue;
                        parts.push(text);
                    }
                    if (parts.length) {
                        description = parts.join('\n').trim();
                    }
                }
            } catch (e) {
                // ignore
            }
            if (!description) {
                // Fallbacks: explicit expandable text or text-based heuristic
                const descElem = item.querySelector('.inline-show-more-text');
                if (descElem) {
                    const raw = (descElem.innerText || descElem.textContent || '').replace(/\r\n?/g, '\n');
                    description = raw
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean)
                        .join('\n');
                } else {
                    description = lines
                        .filter(l => l !== title && l !== date && !/\bSkills:\b/i.test(l))
                        .join('\n')
                        .substring(0, 300)
                        .trim();
                }
            }
            // Ensure we never carry over a trailing Skills label into description
            if (description && /Skills:/i.test(description)) {
                const cut = description.search(/Skills:/i);
                if (cut !== -1) description = description.slice(0, cut).trim();
            }

            // Extract contextual skills (same approach as experiences)
            let contextualSkills = [];
            try {
                // 1) Direct span containing the explicit label 'Skills:'
                const skillSpan = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                    .find(s => /\bSkills:\b/i.test(s.textContent || ''));
                if (skillSpan) {
                    const text = (skillSpan.textContent || '').replace(/^[\s\S]*?Skills:\s*/i, '').trim();
                    const parts = text.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                    const seen = new Set();
                    contextualSkills = parts.filter(p => {
                        const key = p.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }
                // 2) Rows with label (projects sometimes use generic rows)
                if (!contextualSkills.length) {
                    const rows = Array.from(item.querySelectorAll('.display-flex.align-items-center.t-14.t-normal.t-black'))
                        .filter(row => /\bSkills:\b/i.test(row.textContent || ''));
                    for (const row of rows) {
                        const strong = row.querySelector('strong');
                        const container = strong ? strong.parentElement : row;
                        const raw = (container?.textContent || '').replace(/\s+/g, ' ').trim();
                        const m = raw.match(/Skills:\s*(.*)$/i);
                        if (m) {
                            const stripped = m[1].trim();
                            const parts = stripped.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                            const seen = new Set();
                            const tokens = parts.filter(p => {
                                const key = p.toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            if (tokens.length) {
                                contextualSkills = tokens;
                                break;
                            }
                        }
                    }
                }
                // 3) Fallback: any strong label with 'Skills:'
                if (!contextualSkills.length) {
                    const labels = Array.from(item.querySelectorAll('strong'))
                        .filter(el => /\bSkills:\b/i.test(el.textContent || ''));
                    for (const strong of labels) {
                        const raw = (strong.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
                        const m = raw.match(/Skills:\s*(.*)$/i);
                        if (m) {
                            const stripped = m[1].trim();
                            const parts = stripped.split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                            const seen = new Set();
                            const tokens = parts.filter(p => {
                                const key = p.toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            if (tokens.length) {
                                contextualSkills = tokens;
                                break;
                            }
                        }
                    }
                }
                // 4) Text-based fallback: scan inner text for a line starting with 'Skills:'
                if (!contextualSkills.length) {
                    const text = (item.innerText || item.textContent || '').trim();
                    const mt = text.match(/Skills:\s*(.+?)(?:\r?\n|$)/i);
                    if (mt && mt[1]) {
                        const parts = mt[1].trim().split(/\s*(?:·|•|,|\|)\s*/).map(p => p.trim()).filter(Boolean);
                        const seen = new Set();
                        contextualSkills = parts.filter(p => {
                            const key = p.toLowerCase();
                            if (seen.has(key)) return false;
                            if (/\bSkills:\b/i.test(p) || p.includes(' - ')) return false;
                            seen.add(key);
                            return true;
                        });
                    }
                }
            } catch (e) {
                // ignore skills extraction errors for projects
            }

            const project = { title, date, description, url, contextual_skills: contextualSkills };

            // Minimal filtering for debugging
            const isGarbage =
                title.startsWith('Someone at') ||
                title.toLowerCase().includes('show all') ||
                title.toLowerCase().includes('see all');

            if (!isGarbage) {
                projects.push(project);
            }

        } catch (e) {
            console.error(`[Browser] Error processing item ${index}:`, e);
        }
    });

    return projects;
}

/**
 * Extract skills data from LinkedIn details/skills page
 */
function extractSkillsData() {
    const skills = [];
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;

    // Get all skill items
    // Skills page usually has sections (categories) or just a list
    // We look for the bold text which is the skill name
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            // Skill name is usually the first bold span
            const skillNameElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            let skillName = '';

            if (skillNameElem) {
                skillName = skillNameElem.textContent.trim();
            } else {
                // Fallback: look at all spans
                const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                    .map(s => s.textContent.trim())
                    .filter(t => t && t.length > 0);

                if (allSpans.length > 0) {
                    skillName = allSpans[0];
                }
            }

            if (skillName && !skillName.toLowerCase().includes('endorsement')) {
                // Check endorsement count if available (optional, but good for filtering/info)
                // const endorsementElem = item.querySelector('a[href*="endorsement"] span[aria-hidden="true"]');

                skills.push(skillName);
            }
        } catch (e) {
            // Ignore
        }
    });

    // De-duplicate
    return [...new Set(skills)];
}

/**
 * Extract main profile data (top card, about, etc.)
 */
function extractProfileData() {
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

    // Profile image
    const profileImg = document.querySelector('img.pv-top-card-profile-picture__image, button.pv-top-card-profile-picture img, img.pv-top-card-profile-picture__image--show');
    if (profileImg) {
        extractedData.image = profileImg.src || profileImg.getAttribute('data-delayed-url') || '';
    }

    // Name
    const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1.inline.t-24',
        '.pv-text-details__left-panel h1',
        'div.mt2 h1',
        '.artdeco-entity-lockup__title'
    ];
    for (const selector of nameSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
            extractedData.name = elem.textContent.trim();
            break;
        }
    }

    // Headline
    const headlineSelectors = [
        '.text-body-medium.break-words',
        'div.text-body-medium',
        '.pv-text-details__left-panel .text-body-medium',
        '.artdeco-entity-lockup__subtitle'
    ];
    for (const selector of headlineSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim()) {
            extractedData.headline = elem.textContent.trim();
            break;
        }
    }

    // Location
    const locationSelectors = [
        '.text-body-small.inline.t-black--light.break-words',
        'span.text-body-small',
        '.pv-text-details__left-panel span.text-body-small'
    ];
    for (const selector of locationSelectors) {
        const elem = document.querySelector(selector);
        if (elem && elem.textContent.trim() && !elem.textContent.includes('Contact info')) {
            extractedData.location = elem.textContent.trim();
            break;
        }
    }

    // About section
    const aboutSection = document.querySelector('#about');
    if (aboutSection) {
        const aboutContainer = aboutSection.closest('section');
        if (aboutContainer) {
            const aboutText = aboutContainer.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more, .display-flex.full-width');
            if (aboutText) {
                try {
                    const clone = aboutText.cloneNode(true);
                    // Remove any See more/Show more controls that might be inside
                    Array.from(clone.querySelectorAll('button, a')).forEach(el => {
                        const t = (el.textContent || '').trim().toLowerCase();
                        if (/(see|show) more/.test(t)) {
                            el.remove();
                        }
                    });
                    // Prefer innerHTML to preserve formatting (e.g., <br>, <strong>)
                    let html = clone.innerHTML || '';
                    // Normalize excessive breaks/spaces
                    html = html
                        .replace(/\u00A0/g, ' ')
                        .replace(/(\s*<br\s*\/?>(\s|\u00A0)*){3,}/gi, '<br><br>')
                        .trim();
                    extractedData.aboutHtml = html;

                    // Also provide a text fallback that preserves newlines
                    let text = clone.textContent || '';
                    text = text
                        .replace(/\r\n/g, '\n')
                        .replace(/\n{3,}/g, '\n\n')
                        .replace(/[ \t\f\v]+\n/g, '\n')
                        .replace(/\n[ \t\f\v]+/g, '\n')
                        .trim();
                    extractedData.about = text;
                } catch (e) {
                    // Fallback to plain text if anything goes wrong
                    extractedData.about = aboutText.textContent.trim();
                }
            }
        }
    }

    // Experience - improved to handle nested positions at the same company
    const expSection = document.querySelector('#experience');
    if (expSection) {
        const expContainer = expSection.closest('section');
        if (expContainer) {
            const items = expContainer.querySelectorAll('li.artdeco-list__item');

            items.forEach((item) => {
                try {
                    // Check if this is a grouped experience (multiple positions at same company)
                    const groupedRoles = item.querySelectorAll('ul.pvs-list li.pvs-list__paged-list-item');

                    if (groupedRoles.length > 0) {
                        // Multiple positions at same company
                        const companyName = item.querySelector('.t-bold span')?.textContent?.trim() || '';
                        const totalDuration = item.querySelector('.t-14.t-normal span')?.textContent?.trim() || '';

                        groupedRoles.forEach(role => {
                            try {
                                const roleSpans = Array.from(role.querySelectorAll('span[aria-hidden="true"]'))
                                    .map(s => s.textContent.trim())
                                    .filter(t => t && t.length > 0);

                                const experience = {
                                    title: roleSpans[0] || '',
                                    company: companyName,
                                    duration: roleSpans.find(s => /\d{4}|Present|yr|mo|year|month/i.test(s)) || '',
                                    location: roleSpans.find(s => s.includes(',') && !/\d{4}/.test(s) && s.length < 100) || '',
                                    description: ''
                                };

                                const descElem = role.querySelector('.inline-show-more-text, .pvs-list__outer-container');
                                if (descElem) {
                                    let d = descElem.textContent.trim().replace(/\s+/g, ' ');
                                    if (/Skills:/i.test(d)) {
                                        const cut = d.search(/Skills:/i);
                                        if (cut !== -1) d = d.slice(0, cut).trim();
                                    }
                                    experience.description = d;
                                }

                                if (experience.title) {
                                    extractedData.experience.push(experience);
                                }
                            } catch (e) {
                                console.error('Error parsing grouped experience:', e);
                            }
                        });
                    } else {
                        // Single position
                        const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                            .map(s => s.textContent.trim())
                            .filter(t => t && t.length > 0);

                        const titleElem = item.querySelector('.mr1.t-bold span, .t-bold span');
                        const companyElem = item.querySelector('.t-14.t-normal span, .t-14 span');

                        const experience = {
                            title: titleElem?.textContent?.trim() || allSpans[0] || '',
                            company: companyElem?.textContent?.trim() || allSpans[1] || '',
                            duration: '',
                            location: '',
                            description: ''
                        };

                        const durationPattern = /\d{4}|Present|yr|mo|year|month/i;
                        const durationSpan = allSpans.find(s => durationPattern.test(s));
                        if (durationSpan) experience.duration = durationSpan;

                        const locationSpan = allSpans.find(s =>
                            s.includes(',') &&
                            !/\d{4}/.test(s) &&
                            s.length < 100 &&
                            s !== experience.title &&
                            s !== experience.company
                        );
                        if (locationSpan) experience.location = locationSpan;

                        const descElem = item.querySelector('.inline-show-more-text, .t-14.t-normal.t-black, .pvs-list__outer-container');
                        if (descElem) {
                            let d = descElem.textContent.trim().replace(/\s+/g, ' ');
                            if (/Skills:/i.test(d)) {
                                const cut = d.search(/Skills:/i);
                                if (cut !== -1) d = d.slice(0, cut).trim();
                            }
                            experience.description = d;
                        }

                        if (experience.title || experience.company) {
                            extractedData.experience.push(experience);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing experience:', e);
                }
            });
        }
    }

    // Education - improved extraction
    const eduSection = document.querySelector('#education');
    if (eduSection) {
        const eduContainer = eduSection.closest('section');
        if (eduContainer) {
            const items = eduContainer.querySelectorAll('li.artdeco-list__item');

            items.forEach((item) => {
                try {
                    const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                        .map(s => s.textContent.trim())
                        .filter(t => t && t.length > 0 && !t.includes('·')); // Filter out separator dots

                    // Try to get school name from bold text first
                    const schoolElem = item.querySelector('.t-bold span, .mr1.t-bold span');
                    const schoolName = schoolElem?.textContent?.trim() || allSpans[0] || '';

                    const education = {
                        school: schoolName,
                        degree: '',
                        field: '',
                        duration: '',
                        grade: '',
                        activities: '',
                        description: ''
                    };

                    // Try to find degree and field
                    if (allSpans.length > 1) {
                        // Usually: [School, Degree, Field, Duration, ...]
                        const degreeField = allSpans[1];
                        if (degreeField && degreeField.includes(',')) {
                            const parts = degreeField.split(',').map(p => p.trim());
                            education.degree = parts[0] || '';
                            education.field = parts[1] || '';
                        } else {
                            education.degree = degreeField || '';
                            if (allSpans[2] && !allSpans[2].match(/\d{4}/)) {
                                education.field = allSpans[2];
                            }
                        }
                    }

                    // Find duration (contains years)
                    const durationSpan = allSpans.find(s => /\d{4}/.test(s) || s.match(/\d{4}\s*-\s*\d{4}/));
                    if (durationSpan) education.duration = durationSpan;

                    // Find grade/GPA
                    const gradeSpan = allSpans.find(s =>
                        s.toLowerCase().includes('grade') ||
                        s.toLowerCase().includes('gpa') ||
                        s.match(/\d\.\d/)
                    );
                    if (gradeSpan) education.grade = gradeSpan;

                    // Get full description/activities
                    const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container');
                    if (descElem) {
                        const fullText = descElem.textContent.trim().replace(/\s+/g, ' ');
                        // Try to separate activities and description
                        if (fullText.toLowerCase().includes('activities')) {
                            const parts = fullText.split(/activities and societies:/i);
                            if (parts.length > 1) {
                                education.activities = parts[1].trim();
                                education.description = parts[0].trim();
                            } else {
                                education.description = fullText;
                            }
                        } else {
                            education.description = fullText;
                        }
                    }

                    if (education.school) {
                        extractedData.education.push(education);
                    }
                } catch (e) {
                    console.error('Error parsing education:', e);
                }
            });
        }
    }

    // Skills
    const skillsSection = document.querySelector('#skills');
    if (skillsSection) {
        const skillsContainer = skillsSection.closest('section');
        if (skillsContainer) {
            const skillElems = skillsContainer.querySelectorAll('.mr1.t-bold span[aria-hidden="true"], .artdeco-list__item .t-bold span');

            skillElems.forEach(elem => {
                const skill = elem.textContent.trim();
                if (skill && !skill.toLowerCase().includes('endorsement') && skill.length > 1) {
                    extractedData.skills.push(skill);
                }
            });

            extractedData.skills = [...new Set(extractedData.skills)];
        }
    }

    // Certifications
    const certsSection = document.querySelector('#licenses_and_certifications');
    if (certsSection) {
        const certsContainer = certsSection.closest('section');
        if (certsContainer) {
            const items = certsContainer.querySelectorAll('li.artdeco-list__item');

            items.forEach((item) => {
                try {
                    const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                        .map(s => s.textContent.trim())
                        .filter(t => t && t.length > 0);

                    if (allSpans.length > 0) {
                        const cert = {
                            name: allSpans[0] || '',
                            issuer: allSpans[1] || '',
                            date: allSpans.find(s => /\d{4}|Issued/.test(s)) || ''
                        };

                        const link = item.querySelector('a[href*="credential"]');
                        if (link) cert.url = link.href;

                        if (cert.name) {
                            extractedData.certifications.push(cert);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing certification:', e);
                }
            });
        }
    }

    // Patents - extract from the profile page
    try {
        const patentsData = extractPatentsData();
        if (patentsData && patentsData.length > 0) {
            extractedData.patents = patentsData;
        }
    } catch (e) {
        console.error('Error extracting patents:', e);
    }

    return extractedData;
}

/**
 * Extract volunteering data from LinkedIn details/volunteering-experiences page
 */
function extractVolunteeringData() {
    const volunteering = [];
    const mainContent = document.querySelector('main') || document.body;
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            // Get all visible text spans
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);

            if (allSpans.length < 2) return; // Need at least role and organization

            const vol = {
                role: allSpans[0] || '',
                organization: allSpans[1] || '',
                date: '',
                duration: '',
                cause: '',
                description: ''
            };

            // 3rd span is usually date/duration
            // Example: "Nov 2022 - Present · 3 yrs 2 mos"
            const dateSpan = allSpans.find(s => /\d{4}/.test(s) && (s.includes(' - ') || s.includes(' · ')));
            if (dateSpan) {
                vol.date = dateSpan;
                // split duration if present
                if (dateSpan.includes(' · ')) {
                    // "Nov 2022 - Present · 3 yrs 2 mos" -> date: "Nov 2022 - Present", duration: "3 yrs 2 mos"
                    const parts = dateSpan.split(' · ');
                    vol.date = parts[0];
                    vol.duration = parts[1];
                }
            }

            // 4th span might be Cause (e.g. "Environment") if it's not a date, not role, not org
            const causeCandidate = allSpans.find(s =>
                s !== vol.role &&
                s !== vol.organization &&
                s !== dateSpan &&
                !/\d{4}/.test(s) &&
                s.length < 50
            );
            if (causeCandidate) {
                vol.cause = causeCandidate;
            }

            // Description: prefer explicit expandable text
            let description = '';
            const descElem = item.querySelector('.inline-show-more-text');
            if (descElem) {
                const raw = (descElem.innerText || descElem.textContent || '').replace(/\r\n?/g, '\n');
                description = raw
                    .split('\n')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .join('\n');
            }
            // Fallback: parse sub-component rows under the volunteering item
            if (!description) {
                try {
                    const sub = item.querySelector('.pvs-entity__sub-components');
                    if (sub) {
                        const rows = Array.from(sub.querySelectorAll('li.pvs-list__item--with-top-padding'));
                        const parts = [];
                        for (const li of rows) {
                            // Prefer visible span text first
                            const span = li.querySelector('span[aria-hidden="true"]');
                            const text = (span?.innerText || span?.textContent || li.innerText || li.textContent || '')
                                .replace(/\r\n?/g, '\n')
                                .split('\n')
                                .map(s => s.trim())
                                .filter(Boolean)
                                .join('\n');
                            if (!text) continue;
                            // Skip pure cause rows or duplicates of role/org/date/cause
                            const t = text.trim();
                            if (!t) continue;
                            const lower = t.toLowerCase();
                            const isDateLike = /\b\d{4}\b/.test(t) || /present/i.test(t);
                            if (isDateLike) continue;
                            if (t === vol.role || t === vol.organization || t === vol.date || t === vol.duration) continue;
                            if (vol.cause && (t === vol.cause || lower === vol.cause.toLowerCase())) continue;
                            // Skip obvious UI rows
                            if (/add (?:media|link)|show more|see more/i.test(t)) continue;
                            parts.push(t);
                        }
                        if (parts.length) {
                            // Join parts preserving line breaks
                            description = parts.join('\n').trim();
                        }
                    }
                } catch (e) {
                    // ignore sub-component parsing errors
                }
            }
            // Last resort: pick a long span that's not metadata
            if (!description) {
                const longText = allSpans.find(s =>
                    s.length > 40 &&
                    s !== vol.role &&
                    s !== vol.organization &&
                    s !== vol.date &&
                    s !== vol.duration &&
                    s !== vol.cause
                );
                if (longText) description = longText;
            }
            vol.description = description;

            // Filter out garbage/viewers
            const isGarbage =
                vol.role.startsWith('Someone at') ||
                vol.organization.startsWith('Someone at');

            if (!isGarbage && vol.role) {
                volunteering.push(vol);
            }
        } catch (e) {
            console.error('Error extracting volunteering item:', e);
        }
    });

    return volunteering;
}

/**
 * Extract publication data from LinkedIn details/publications page
 */
function extractPublicationsData() {
    const publications = [];
    const mainContent = document.querySelector('main') || document.body;
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);

            if (allSpans.length === 0) return;

            const pub = {
                title: '',
                publisher: '',
                date: '',
                description: '',
                url: ''
            };

            // Title is usually the first bold span or the first span
            const titleElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            if (titleElem) {
                pub.title = titleElem.textContent.trim();
            } else {
                pub.title = allSpans[0];
            }

            // Second span usually contains publisher and date, possibly separated by '·'
            const subtitle = allSpans.find(s => s !== pub.title && (/\d{4}/.test(s) || s.includes('·')));
            if (subtitle) {
                if (subtitle.includes('·')) {
                    const parts = subtitle.split('·').map(s => s.trim());
                    // Assume format: Publisher · Date or similar
                    // Heuristic: Date usually has digits, Publisher usually doesn't (or fewer)
                    // But date could be "Nov 3, 2022"

                    const datePart = parts.find(p => /\d{4}/.test(p));
                    const publisherPart = parts.find(p => p !== datePart);

                    if (datePart) pub.date = datePart;
                    if (publisherPart) pub.publisher = publisherPart;
                } else {
                    // Just date?
                    if (/\d{4}/.test(subtitle)) {
                        pub.date = subtitle;
                    } else {
                        pub.publisher = subtitle;
                    }
                }
            }

            // URL
            const linkElem = item.querySelector('a.optional-action-target-wrapper, a[href*="publication"]');
            if (linkElem) {
                pub.url = linkElem.href;
            }

            // Description
            const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container .pvs-list__item--with-top-padding');
            if (descElem) {
                const raw = (descElem.innerText || descElem.textContent || '').replace(/\r\n?/g, '\n');
                pub.description = raw
                    .split('\n')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .join('\n');
            }

            // Filter garbage
            if (pub.title && !pub.title.startsWith('Someone at')) {
                publications.push(pub);
            }

        } catch (e) {
            console.error('Error extracting publication item:', e);
        }
    });

    return publications;
}

/**
 * Extract honors data from LinkedIn details/honors page
 */
function extractHonorsData() {
    const honors = [];
    const mainContent = document.querySelector('main') || document.body;
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);

            if (allSpans.length === 0) return;

            const honor = {
                title: '',
                issuer: '',
                date: '',
                description: ''
            };

            // Title is usually the first bold span
            const titleElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            if (titleElem) {
                honor.title = titleElem.textContent.trim();
            } else {
                honor.title = allSpans[0];
            }

            // Issuer and Date are usually in the second span, separated by '·' or just one of them
            // Example: "Issued by The University of Edinburgh · Jun 2018"
            // or just "Issued by ..."

            const subtitle = allSpans.find(s => s !== honor.title && (s.includes('Issued by') || /\d{4}/.test(s)));

            if (subtitle) {
                if (subtitle.includes('·')) {
                    const parts = subtitle.split('·').map(s => s.trim());
                    const datePart = parts.find(p => /\d{4}/.test(p));
                    const issuerPart = parts.find(p => p.includes('Issued by'));

                    if (datePart) honor.date = datePart;
                    if (issuerPart) honor.issuer = issuerPart.replace('Issued by', '').trim();
                } else {
                    if (subtitle.includes('Issued by')) {
                        honor.issuer = subtitle.replace('Issued by', '').trim();
                    } else if (/\d{4}/.test(subtitle)) {
                        honor.date = subtitle;
                    }
                }
            }

            // Description extraction
            const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container .pvs-list__item--with-top-padding');
            if (descElem) {
                const raw = (descElem.innerText || descElem.textContent || '').replace(/\r\n?/g, '\n');
                honor.description = raw
                    .split('\n')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .join('\n');
            }

            if (honor.title && !honor.title.startsWith('Someone at')) {
                honors.push(honor);
            }

        } catch (e) {
            console.error('Error extracting honor item:', e);
        }
    });

    return honors;
}

// Extract languages data from LinkedIn details/languages page
function extractLanguagesData() {
    const languages = [];
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;

    // Get all language items
    const items = mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated');

    items.forEach(item => {
        try {
            // Language name is usually the first bold span
            const languageNameElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            let languageName = '';

            if (languageNameElem) {
                languageName = languageNameElem.textContent.trim();
            } else {
                // Fallback: look at all spans
                const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                    .map(s => s.textContent.trim())
                    .filter(t => t && t.length > 0);

                if (allSpans.length > 0) {
                    languageName = allSpans[0];
                }
            }

            // Filter out viewer data and other non-language items
            if (languageName &&
                !languageName.toLowerCase().includes('viewer') &&
                !languageName.toLowerCase().includes('private to you') &&
                !languageName.toLowerCase().includes('edit language')) {
                languages.push(languageName);
            }
        } catch (e) {
            // Ignore
        }
    });

    // De-duplicate
    return [...new Set(languages)];
}

/**
 * Extract patents data from LinkedIn profile page OR details/patents page
 * Works on both the main profile page and dedicated /details/patents/ page
 */
function extractPatentsData() {
    const patents = [];

    // First, check if we're on a details page (main content area)
    const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    let items = [];

    // Try to find patents in the main content area (works for details pages)
    items = Array.from(mainContent.querySelectorAll('li.pvs-list__paged-list-item, li.artdeco-list__item, .pvs-list__item--line-separated'));

    // If we found list items in main content, filter for patent-related ones
    if (items.length > 0) {
        // On details page, all items should be patents
        // On profile page, we need to filter
        const filteredItems = items.filter(item => {
            const ariaLabels = Array.from(item.querySelectorAll('[aria-label]'))
                .map(el => el.getAttribute('aria-label') || '')
                .join(' ')
                .toLowerCase();

            const links = Array.from(item.querySelectorAll('a'))
                .map(a => a.href || '')
                .join(' ')
                .toLowerCase();

            const text = item.textContent || '';

            // Check if this item is patent-related
            return (
                ariaLabels.includes('patent') ||
                links.includes('patent') ||
                links.includes('google.com/patents') ||
                // Check for patent numbers in text (e.g., US20220147766A1)
                /[A-Z]{2}\d{8,}[A-Z]?\d*/i.test(text)
            );
        });

        // Use filtered items if we found any patent-related ones
        if (filteredItems.length > 0) {
            items = filteredItems;
        } else {
            // No patent-related items found
            // If we have a small number of items (< 10), we might be on a details page where all items are patents
            // If we have many items (>= 10), we're probably on the wrong page or profile page without patents
            if (items.length >= 10) {
                items = []; // Too many items and none are patent-related - not on patents page
            }
            // else: keep the items (might be on a details page with few patents)
        }
    }

    // Fallback: try to find a dedicated patents section on profile page
    if (items.length === 0) {
        const patentsSection = document.querySelector('#patents, section:has(#patents)');
        if (patentsSection) {
            const patentsContainer = patentsSection.closest('section');
            if (patentsContainer) {
                items = Array.from(patentsContainer.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item, li.pvs-list__item--line-separated'));
            }
        }
    }

    items.forEach(item => {
        try {
            const allSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
                .map(s => s.textContent.trim())
                .filter(t => t && t.length > 0);

            if (allSpans.length === 0) return;

            const patent = {
                title: '',
                number: '',
                issuer: '',
                date: '',
                url: '',
                description: ''
            };

            // Patent number/title is usually the first bold span
            // Format is often "Patent Number - Title" (e.g., "US20220147766A1 - Vertex interpolation...")
            const titleElem = item.querySelector('.mr1.t-bold span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
            if (titleElem) {
                const fullTitle = titleElem.textContent.trim();
                patent.title = fullTitle;

                // Try to extract patent number if it's in the format "NUMBER - Title"
                if (fullTitle.includes(' - ')) {
                    const parts = fullTitle.split(' - ');
                    if (parts[0] && /^[A-Z]{2}\d+[A-Z]?\d*$/i.test(parts[0].trim())) {
                        patent.number = parts[0].trim();
                        patent.title = parts.slice(1).join(' - ').trim();
                    }
                }
            } else if (allSpans.length > 0) {
                patent.title = allSpans[0];
            }

            // Try to find issuer and date
            // Format can be: "Issued · Date" or "Patent Office"
            const metadataSpan = allSpans.find(s =>
                s !== patent.title &&
                (s.toLowerCase().includes('issued') ||
                    s.toLowerCase().includes('patent') ||
                    /\d{4}/.test(s))
            );

            if (metadataSpan) {
                if (metadataSpan.includes('·')) {
                    const parts = metadataSpan.split('·').map(s => s.trim());
                    parts.forEach(part => {
                        if (/\d{4}/.test(part)) {
                            patent.date = part;
                        } else if (part.toLowerCase().includes('issued') || part.toLowerCase().includes('patent')) {
                            patent.issuer = part;
                        }
                    });
                } else if (/\d{4}/.test(metadataSpan)) {
                    patent.date = metadataSpan;
                } else {
                    patent.issuer = metadataSpan;
                }
            }

            // Get description
            const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container .pvs-list__item--with-top-padding');
            if (descElem) {
                patent.description = descElem.textContent.trim().replace(/\s+/g, ' ');
            } else {
                // Try to find description from remaining spans
                const descCandidate = allSpans.find(s =>
                    s !== patent.title &&
                    s !== metadataSpan &&
                    s.length > 30
                );
                if (descCandidate) {
                    patent.description = descCandidate;
                }
            }

            // Get URL if available
            const linkElem = item.querySelector('a.optional-action-target-wrapper, a[href*="patent"], a[href*="google.com/patents"]');
            if (linkElem) {
                patent.url = linkElem.href;
            }

            // Filter out viewer data / garbage
            const isGarbage =
                patent.title.startsWith('Someone at') ||
                patent.title.includes('…') ||
                patent.title.toLowerCase().includes('show all') ||
                patent.title.toLowerCase().includes('see all') ||
                !patent.title; // Must have a title

            if (!isGarbage) {
                patents.push(patent);
            }

        } catch (e) {
            console.error('Error extracting patent item:', e);
        }
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
    extractProfileData,
    extractVolunteeringData,
    extractPublicationsData,
    extractHonorsData,
    extractLanguagesData,
    extractPatentsData
};
