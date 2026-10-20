/** Escapes text for safe interpolation into HTML email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Minimal, table-free HTML shell. Email clients ignore most CSS, so styles are inline and the
 * layout is a single centred column. Every email also has a plain-text part.
 */
export function emailLayout(bodyHtml: string, footerText: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      ${bodyHtml}
    </div>
    <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#71717a;text-align:center;">${escapeHtml(footerText)}</p>
  </div>
</body>
</html>`;
}
