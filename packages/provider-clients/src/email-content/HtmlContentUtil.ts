function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (char: string): string => {
    switch (char) {
      case '&': {
        return '&amp;';
      }
      case '<': {
        return '&lt;';
      }
      case '>': {
        return '&gt;';
      }
      case '"': {
        return '&quot;';
      }
      case "'": {
        return '&#39;';
      }
      default: {
        return char;
      }
    }
  });
}

function sanitizeHtml(value: string): string {
  const parts: string[] = [];
  let pos = 0;
  const lowerVal = value.toLowerCase();

  while (pos < value.length) {
    const anchorIdx = lowerVal.indexOf('<a href="', pos);
    if (anchorIdx === -1) {
      parts.push(escapeHtml(value.slice(pos)));
      break;
    }
    parts.push(escapeHtml(value.slice(pos, anchorIdx)));

    const hrefStart = anchorIdx + 9;
    const hrefEnd = value.indexOf('"', hrefStart);
    if (hrefEnd === -1) {
      parts.push(escapeHtml(value.slice(anchorIdx)));
      break;
    }
    const href = value.slice(hrefStart, hrefEnd);
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      parts.push(escapeHtml(value.slice(anchorIdx)));
      break;
    }
    const tagClose = value.indexOf('>', hrefEnd);
    if (tagClose === -1) {
      parts.push(escapeHtml(value.slice(anchorIdx)));
      break;
    }
    const closeAnchor = lowerVal.indexOf('</a>', tagClose);
    if (closeAnchor === -1 || closeAnchor < tagClose) {
      parts.push(escapeHtml(value.slice(anchorIdx)));
      break;
    }
    const innerText = value.slice(tagClose + 1, closeAnchor);
    parts.push(`<a href="${escapeHtml(href)}">${escapeHtml(innerText)}</a>`);
    pos = closeAnchor + 4;
  }

  return parts.join('');
}

export { escapeHtml, sanitizeHtml };
