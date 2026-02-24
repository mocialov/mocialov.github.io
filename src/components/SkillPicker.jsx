import React, { useState, useRef, useEffect } from 'react';

/**
 * A dropdown skill picker that lets users search and toggle skills
 * from the full list of scraped skills onto an item (experience/project).
 *
 * Props:
 *  - allSkills: string[] – the master list of all scraped skills
 *  - selectedSkills: string[] – currently assigned skills
 *  - onChange: (skills: string[]) => void – called with the new array
 */
export default function SkillPicker({ allSkills = [], selectedSkills = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus search when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const selected = new Set(selectedSkills);

  const toggle = (skill) => {
    const next = selected.has(skill)
      ? selectedSkills.filter((s) => s !== skill)
      : [...selectedSkills, skill];
    onChange(next);
  };

  const remove = (skill) => {
    onChange(selectedSkills.filter((s) => s !== skill));
  };

  const lowerSearch = search.toLowerCase();
  const filtered = allSkills.filter((s) => s.toLowerCase().includes(lowerSearch));

  // Sort: selected first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const aS = selected.has(a) ? 0 : 1;
    const bS = selected.has(b) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return a.localeCompare(b);
  });

  return (
    <div className="skill-picker" ref={containerRef}>
      {/* Assigned skill badges with remove buttons */}
      {selectedSkills.length > 0 && (
        <div className="skill-picker__badges">
          {selectedSkills.map((s) => (
            <span key={s} className="skill-badge skill-badge--removable">
              {s}
              <button
                type="button"
                className="skill-badge__remove"
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        className="skill-picker__toggle"
        onClick={() => setOpen((v) => !v)}
        title="Pick skills from your scraped skills list"
      >
        {open ? '✕ Close' : '+ Skills'}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="skill-picker__dropdown">
          <input
            ref={searchRef}
            type="text"
            className="skill-picker__search"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="skill-picker__list">
            {sorted.length === 0 && (
              <div className="skill-picker__empty">No skills found</div>
            )}
            {sorted.map((skill) => {
              const isSelected = selected.has(skill);
              return (
                <label key={skill} className={`skill-picker__option${isSelected ? ' skill-picker__option--selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(skill)}
                  />
                  <span>{skill}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
