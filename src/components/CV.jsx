import React from 'react';

const LinkedInURL = 'https://www.linkedin.com/in/mocialov/';

function safeList(text) {
  if (!text) return [];
  const raw = text.split(/\n|\r|\.|•|\u2022/).map(s => s.trim()).filter(Boolean);
  // Limit bullets for readability
  return raw.slice(0, 6);
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
          <div className="cv-contact cv-contact--linkedin"><a href={LinkedInURL} target="_blank" rel="noopener noreferrer">LinkedIn: mocialov</a></div>
        </div>
      </header>

      {data.about && (
        <section className="cv-section">
          <h2 className="cv-section__title">Summary</h2>
          <p className="cv-summary">{data.about}</p>
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
                <div className="cv-item__header">
                  <div className="cv-item__role">{exp.title}</div>
                  <div className="cv-item__meta">
                    <span className="cv-item__company">{exp.company}</span>
                    {(() => {
                      const dateDisplay =
                        (exp.from || exp.to)
                          ? `${exp.from || ''}${exp.to ? ` – ${exp.to}` : ''}`
                          : (exp.dates || exp.duration || '');
                      return dateDisplay ? (
                        <span className="cv-item__date">{dateDisplay}</span>
                      ) : null;
                    })()}
                    {exp.location && <span className="cv-item__loc">{exp.location}</span>}
                  </div>
                </div>
                {exp.description && (
                  <ul className="cv-bullets">
                    {safeList(exp.description).map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
                {Array.isArray(exp.contextual_skills) && exp.contextual_skills.length > 0 && (
                  <ul className="cv-experience-skills">
                    {exp.contextual_skills.map((s, k) => (
                      <li key={k} className="cv-skill">{s}</li>
                    ))}
                  </ul>
                )}
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
                <div className="cv-item__header">
                  <div className="cv-item__role">
                    {proj.url ? (
                      <a href={proj.url} target="_blank" rel="noopener noreferrer">{proj.title}</a>
                    ) : (
                      proj.title
                    )}
                  </div>
                  <div className="cv-item__meta">
                    {proj.date && <span className="cv-item__date">{proj.date}</span>}
                  </div>
                </div>
                {proj.description && (
                  <ul className="cv-bullets">
                    {safeList(proj.description).map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
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
                <div className="cv-item__header">
                  <div className="cv-item__role">{edu.school}</div>
                  <div className="cv-item__meta">
                    <span className="cv-item__company">{edu.degree}{edu.field ? ` • ${edu.field}` : ''}</span>
                    {edu.duration && <span className="cv-item__date">{edu.duration}</span>}
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
          <ul className="cv-inline">
            {filteredCerts.slice(0, 6).map((cert, i) => (
              <li key={i}>
                <span className="cv-cert__name">{cert.name}</span>
                {cert.issuer && <span className="cv-cert__issuer"> — {cert.issuer}</span>}
                {cert.date && <span className="cv-cert__date"> ({cert.date})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
