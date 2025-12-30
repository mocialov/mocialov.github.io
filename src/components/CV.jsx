import React from 'react';
import DOMPurify from 'dompurify';

function safeList(text) {
  if (!text) return [];
  // Split only on explicit list markers or newlines; avoid periods which caused over-bulleting
  const raw = String(text)
    .split(/\r?\n|•|\u2022/)
    .map(s => s.replace(/^[\-*•\u2022]\s*/, '').trim())
    .filter(Boolean);
  return raw.slice(0, 6);
}

function isLikelyList(text) {
  if (!text) return false;
  const t = String(text);
  if (/<li|<ul/i.test(t)) return true;
  if (/•|\u2022/.test(t)) return true;
  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const markerCount = lines.filter(l => /^[\-*•\u2022]/.test(l)).length;
  return markerCount >= Math.max(2, Math.floor(lines.length / 2));
}

function sanitizeParagraph(text) {
  if (!text) return '';
  const raw = String(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['b','strong','i','em','u','br','p','a','span'],
    ALLOWED_ATTR: ['href','target','rel'],
    ADD_ATTR: ['target','rel']
  });
}

export default function CV({ data }) {
  if (!data) return null;

  const filteredExperience = (data.experience || []).filter(exp => {
    const isViewerData =
      exp.title?.startsWith('Someone at') ||
      exp.company?.startsWith('Someone at') ||
      exp.title?.includes('…') ||
      exp.title?.includes('...') ||
      (exp.title?.match(/\bat\b/i) && !exp.company && !exp.dates && !exp.from && !exp.to) ||
      ((!exp.dates && !exp.from && !exp.to) && !exp.company && exp.title);
    return !isViewerData;
  });

  const filteredProjects = (data.projects || []).filter(proj => {
    const isViewerData =
      proj.title?.startsWith('Someone at') ||
      proj.title?.includes('…') ||
      proj.title?.includes('...') ||
      (!proj.date && !proj.description);
    return !isViewerData;
  });

  const filteredVolunteer = (data.volunteer || []).filter(vol => {
    const isViewerData =
      vol.role?.startsWith('Someone at') ||
      vol.organization?.startsWith('Someone at') ||
      (!vol.date && !vol.organization);
    return !isViewerData;
  });

  const filteredCerts = (data.certifications || []).filter(cert => {
    const isViewerData =
      cert.name?.startsWith('Someone at') ||
      cert.issuer?.startsWith('Someone at') ||
      cert.name?.includes('Someone at') ||
      cert.name?.includes('…') ||
      cert.name?.includes('...') ||
      cert.name?.includes('Database Developer in the') ||
      (cert.name?.includes(' at ') && !cert.issuer && !cert.date) ||
      (!cert.name || !cert.issuer);
    return !isViewerData;
  });

  const filteredEducation = data.education || [];
  const topSkills = (data.skills || []).slice(0, 12);

  const sanitizeSummaryHtml = (htmlOrText) => {
    if (!htmlOrText) return '';
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(htmlOrText) || htmlOrText.includes('<br');
    const raw = looksLikeHtml ? htmlOrText : String(htmlOrText).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'b','strong','i','em','u','br','p','ul','ol','li','a',
        'h1','h2','h3','h4','h5','h6','span','div','pre','code','blockquote','hr','sup','sub'
      ],
      ALLOWED_ATTR: ['href','target','rel'],
      ADD_ATTR: ['target','rel']
    });
  };

  const MONTHS = {
    january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May', june: 'Jun',
    july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec'
  };

  const shortenMonths = (s) => {
    if (!s) return s;
    let out = String(s);
    Object.entries(MONTHS).forEach(([full, short]) => {
      const re = new RegExp(`\\b${full}\\b`, 'i');
      out = out.replace(re, short);
    });
    return out;
  };

  const normalizeDash = (s) => String(s).replace(/[\-—–]+/g, '\u00A0–\u00A0');
  const normalizeSpaces = (s) => String(s).replace(/[ \t\n\r\f\v]+/g, ' ').trim();

  const formatDateText = ({ from, to, dates, duration }) => {
    if (from || to) {
      const f = normalizeSpaces(shortenMonths(from || ''));
      const t = normalizeSpaces(shortenMonths(to || ''));
      const core = t ? `${f}${t ? ' - ' + t : ''}` : f;
      return normalizeDash(core).trim();
    }
    if (dates) {
      return normalizeDash(normalizeSpaces(shortenMonths(dates))).trim();
    }
    if (duration) {
      return normalizeSpaces(shortenMonths(duration)).trim();
    }
    return '';
  };

  const locationTokens = (loc) => {
    if (!loc) return { city: null, country: null };
    const tokens = loc.split(',').map(s => s.trim()).filter(Boolean);
    if (tokens.length >= 2) {
      return { city: tokens[0], country: tokens[tokens.length - 1] };
    }
    return { city: tokens[0] || loc, country: null };
  };
  const { city: locCity, country: locCountry } = locationTokens(data.location);

  return (
    <div className="cv-page" id="cv">
      <header className="cv-header">
        <div className="cv-header__identity">
          <h1 className="cv-name">{data.name}</h1>
          <div className="cv-role">{data.headline}</div>
        </div>
        <div className="cv-header__contact">
          {(locCity || locCountry) && (
            <div className="cv-contact cv-contact--location">
              {locCity && <span className="cv-contact__city">{locCity}</span>}
              {locCountry && <span className="cv-contact__country">{locCountry}</span>}
            </div>
          )}
        </div>
      </header>

      {data.about && (
        <section className="cv-section">
          <h2 className="cv-section__title">Summary</h2>
          <div
            className="cv-summary"
            dangerouslySetInnerHTML={{ __html: sanitizeSummaryHtml(data.aboutHtml || data.about) }}
          />
        </section>
      )}

      {topSkills.length > 0 && (
        <section className="cv-section cv-skills-section">
          <h2 className="cv-section__title">Skills</h2>
          <ul className="cv-skills">
            {topSkills.map((s, i) => (
              <li key={i} className="cv-skill">{s}</li>
            ))}
          </ul>
        </section>
      )}

      {filteredExperience.length > 0 && (
        <section className="cv-section">
          <h2 className="cv-section__title">Experience</h2>
          <div className="cv-list">
            {filteredExperience.map((exp, i) => (
              <div key={i} className="cv-item">
                <div className="cv-item__line">
                  <div className="cv-item__date cv-item__date--lead">
                    {formatDateText({ from: exp.from, to: exp.to, dates: exp.dates, duration: exp.duration })}
                  </div>
                  <div className="cv-item__content">
                    <div className="cv-item__role">{exp.title}</div>
                    <div className="cv-item__meta">
                      <span className="cv-item__company">{exp.company}</span>
                      {exp.location && <span className="cv-item__loc">{exp.location}</span>}
                    </div>
                    {exp.description && (
                      isLikelyList(exp.description) ? (
                        <ul className="cv-bullets">
                          {safeList(exp.description).map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <div
                          className="cv-item__text"
                          dangerouslySetInnerHTML={{ __html: sanitizeParagraph(exp.description) }}
                        />
                      )
                    )}
                    {Array.isArray(exp.contextual_skills) && exp.contextual_skills.length > 0 && (
                      <ul className="cv-experience-skills">
                        {exp.contextual_skills.map((s, k) => (
                          <li key={k} className="cv-skill">{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredProjects.length > 0 && (
        <section className="cv-section">
          <h2 className="cv-section__title">Projects</h2>
          <div className="cv-list">
            {filteredProjects.slice(0, 4).map((proj, i) => (
              <div key={i} className="cv-item">
                <div className="cv-item__line">
                  <div className="cv-item__date cv-item__date--lead">
                    {formatDateText({ dates: proj.date })}
                  </div>
                  <div className="cv-item__content">
                    <div className="cv-item__role">
                    {proj.url ? (
                      <a href={proj.url} target="_blank" rel="noopener noreferrer">{proj.title}</a>
                    ) : (
                      proj.title
                    )}
                    </div>
                    {proj.description && (
                      isLikelyList(proj.description) ? (
                        <ul className="cv-bullets">
                          {safeList(proj.description).map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <div
                          className="cv-item__text"
                          dangerouslySetInnerHTML={{ __html: sanitizeParagraph(proj.description) }}
                        />
                      )
                    )}
                    {Array.isArray(proj.contextual_skills) && proj.contextual_skills.length > 0 && (
                      <ul className="cv-experience-skills">
                        {proj.contextual_skills.map((s, k) => (
                          <li key={k} className="cv-skill">{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredEducation.length > 0 && (
        <section className="cv-section">
          <h2 className="cv-section__title">Education</h2>
          <div className="cv-list">
            {filteredEducation.map((edu, i) => (
              <div key={i} className="cv-item">
                <div className="cv-item__line">
                  <div className="cv-item__date cv-item__date--lead">
                    {formatDateText({ from: edu.from, to: edu.to, dates: null, duration: edu.duration })}
                  </div>
                  <div className="cv-item__content">
                    <div className="cv-item__role">{edu.school}</div>
                    <div className="cv-item__meta">
                      <span className="cv-item__company">{edu.degree}{edu.field ? ` • ${edu.field}` : ''}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredVolunteer.length > 0 && (
        <section className="cv-section">
          <h2 className="cv-section__title">Volunteering</h2>
          <div className="cv-list">
            {filteredVolunteer.map((vol, i) => (
              <div key={i} className="cv-item">
                <div className="cv-item__line">
                  <div className="cv-item__date cv-item__date--lead">
                    {formatDateText({ dates: vol.date, duration: vol.duration })}
                  </div>
                  <div className="cv-item__content">
                    <div className="cv-item__role">{vol.role}</div>
                    <div className="cv-item__meta">
                      <span className="cv-item__company">{vol.organization}</span>
                      {vol.cause && <span className="cv-item__loc">{vol.cause}</span>}
                    </div>
                    {vol.description && (
                      isLikelyList(vol.description) ? (
                        <ul className="cv-bullets">
                          {safeList(vol.description).map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <div
                          className="cv-item__text"
                          dangerouslySetInnerHTML={{ __html: sanitizeParagraph(vol.description) }}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredCerts.length > 0 && (
        <section className="cv-section">
          <h2 className="cv-section__title">Certifications</h2>
          <ul className="cv-cert-list">
            {filteredCerts.slice(0, 6).map((cert, i) => (
              <li key={i} className="cv-cert-item">
                <span className="cv-item__date cv-item__date--lead">{formatDateText({ dates: cert.date })}</span>
                <span>
                  <span className="cv-cert__name">{cert.name}</span>
                  {cert.issuer && <span className="cv-cert__issuer"> — {cert.issuer}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
