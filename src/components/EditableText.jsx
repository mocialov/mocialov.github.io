import React, { useRef } from 'react';
import DOMPurify from 'dompurify';

export default function EditableText({
  value,
  onChange,
  tag = 'span',
  className,
  placeholder = '',
  allowHtml = false,
}) {
  const ref = useRef(null);
  const Tag = tag;
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  // Normalize incoming text for consistent newline rendering in plain mode
  const sanitized = (() => {
    if (allowHtml) {
      const v = String(value || '');
      const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(v) || v.includes('<br');
      const normalized = looksLikeHtml
        ? v
        : v.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
      return DOMPurify.sanitize(normalized);
    }
    return String(value || '')
      .replace(/<br\s*\/?>(\n)?/gi, '\n')
      .replace(/\r\n?/g, '\n');
  })();

  const handleBlur = (e) => {
    const el = ref.current;
    if (!el) return;
    let newVal = allowHtml ? el.innerHTML : el.innerText;
    // Normalize line breaks for plain text mode
    if (!allowHtml) {
      newVal = newVal.replace(/\r\n?/g, '\n');
    }
    if (onChange) onChange(newVal);
  };

  const handleKeyDown = (e) => {
    // Finish edit on meta/ctrl+enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <Tag
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
      style={{ outline: 'none' }}
      dangerouslySetInnerHTML={allowHtml
        ? { __html: sanitized || '' }
        : { __html: escapeHtml(sanitized || '').replace(/\n/g, '<br>') }}
    >
      {null}
    </Tag>
  );
}
