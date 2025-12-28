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

            // Find dates (contains year or "Present")
            const dates = allSpans.find(s => /\d{4}|Present/i.test(s) && !s.includes('Issued')) || '';

            // Find location (has comma, no years, not too long)
            const location = allSpans.find(s =>
                s.includes(',') &&
                !/\d{4}/.test(s) &&
                s.length < 100 &&
                s !== title &&
                s !== companyLine
            ) || '';

            // Description is usually in a container with specific class or the longest non-metadata text
            let description = '';
            const descContainer = item.querySelector('.inline-show-more-text, .pvs-list__outer-container');
            if (descContainer) {
                description = descContainer.textContent.trim().replace(/\s+/g, ' ');
            } else {
                // Look for longer text that's not metadata
                const longText = allSpans.find(s =>
                    s.length > 50 &&
                    s !== title &&
                    s !== companyLine &&
                    s !== dates &&
                    s !== location
                );
                if (longText) description = longText;
            }

            // Filter out viewer data
            const isViewerData =
                title.startsWith('Someone at') ||
                companyLine.startsWith('Someone at') ||
                title.includes('…') ||
                (!dates && !companyLine);

            if (!isViewerData && title) {
                experiences.push({
                    title,
                    company: companyLine,
                    dates,
                    location,
                    description
                });
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
                duration: dateElem?.textContent?.trim() || allSpans.find(s => /\d{4}/.test(s)) || '',
                description: ''
            };

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

            // Description: Everything else
            let description = '';
            // Try to find the "description" block specifically if possible
            const descElem = item.querySelector('.inline-show-more-text');
            if (descElem) {
                description = descElem.innerText.trim().replace(/\s+/g, ' ');
            } else {
                // Fallback: Join lines that aren't title or date
                description = lines.filter(l => l !== title && l !== date).join(' ').substring(0, 200);
            }

            const project = { title, date, description, url };

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
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
        volunteer: [],
        languages: [],
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
                extractedData.about = aboutText.textContent.trim().replace(/\s+/g, ' ');
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
                                    experience.description = descElem.textContent.trim().replace(/\s+/g, ' ');
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
                            experience.description = descElem.textContent.trim().replace(/\s+/g, ' ');
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

            // Description
            const descElem = item.querySelector('.inline-show-more-text, .pvs-list__outer-container .pvs-list__item--with-top-padding');
            if (descElem) {
                vol.description = descElem.textContent.trim().replace(/\s+/g, ' ');
            }

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
                pub.description = descElem.textContent.trim().replace(/\s+/g, ' ');
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
                honor.description = descElem.textContent.trim().replace(/\s+/g, ' ');
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
    extractLanguagesData
};
