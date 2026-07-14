import type { CSSProperties } from 'react';
import { Button } from './shared/Button';

interface OnlyOfficeLaunchProps {
  docUrl?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
}

/**
 * ONLYOFFICE External Launcher
 *
 * Launches the ONLYOFFICE Docs editor in the user's default browser for
 * advanced DOCX editing with track changes, TOC generation, spell check,
 * commenting, and full formatting.
 *
 * Prerequisites:
 *   - ONLYOFFICE Docs (Community Edition) running locally or on a server
 *   - Install: docker run -p 8080:80 onlyoffice/documentserver
 *
 * For production use, the document is exported as DOCX and opened in
 * ONLYOFFICE through the browser. After editing, the user re-uploads
 * the revised document back to OTIF.
 */
export function OnlyOfficeLaunch({
  docUrl, label = 'Open in ONLYOFFICE Editor',
  size = 'sm', className = '', style,
}: OnlyOfficeLaunchProps) {
  const handleLaunch = () => {
    // Open ONLYOFFICE in the default browser
    const onlyOfficeUrl = docUrl || 'http://localhost:8080';
    window.open(onlyOfficeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      variant="secondary"
      size={size}
      onClick={handleLaunch}
      className={className}
      style={style}
      title="Open in ONLYOFFICE Docs — full DOCX editor with track changes, TOC, and formatting"
    >
      📄 {label}
    </Button>
  );
}

/** Banner shown when ONLYOFFICE is not installed */
export function OnlyOfficeSetupBanner() {
  return (
    <div style={{
      marginTop: '12px', padding: '12px 16px',
      background: 'hsla(191, 90%, 55%, 0.08)',
      border: '1px solid hsla(191, 90%, 55%, 0.2)',
      borderRadius: 'var(--r-md)',
      fontSize: '12px', color: 'var(--text-secondary)',
      lineHeight: 1.6,
    }}>
      <strong style={{ color: 'var(--accent-cyan)' }}>💡 Pro Tip: Advanced DOCX Editing</strong>
      <p style={{ margin: '6px 0 0' }}>
        For full DOCX editing with <strong>Track Changes, Table of Contents, spell check, and commenting</strong>,
        install ONLYOFFICE Docs (free Community Edition):
      </p>
      <code style={{
        display: 'block', margin: '8px 0', padding: '6px 10px',
        background: 'var(--bg-muted)', borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--font-mono)', fontSize: '11px',
      }}>
        docker run -p 8080:80 onlyoffice/documentserver
      </code>
      <p style={{ margin: 0 }}>
        Then export your thesis as DOCX and open it in ONLYOFFICE for professional formatting.
      </p>
    </div>
  );
}
