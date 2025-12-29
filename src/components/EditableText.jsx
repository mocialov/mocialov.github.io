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
  const sanitized = allowHtml ? DOMPurify.sanitize(value || '') : (value || '');

  const handleBlur = (e) => {
    const el = ref.current;
    if (!el) return;
    let newVal = allowHtml ? el.innerHTML : el.innerText;
    // Normalize line breaks for plain text mode
    if (!allowHtml) {
      newVal = newVal.replace(/\r\n/g, '\n');
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
      dangerouslySetInnerHTML={allowHtml ? { __html: sanitized || '' } : undefined}
    >
      {!allowHtml ? (sanitized || '') : null}
    </Tag>
  );
}
