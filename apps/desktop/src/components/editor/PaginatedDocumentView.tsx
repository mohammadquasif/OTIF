import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/react';

interface PaginatedDocumentViewProps {
  editor: Editor | null;
  children: ReactNode;
  pageWidth?: number;   // in px, default A4 at 96dpi ≈ 794px
  pageHeight?: number;  // in px, default A4 at 96dpi ≈ 1123px
  marginMM?: number;    // page margin in mm, default 25.4 (1 inch)
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  className?: string;
  style?: CSSProperties;
}

const MM_TO_PX = 3.7795; // 1mm = ~3.78px at 96dpi

export function PaginatedDocumentView({
  editor, children,
  pageWidth = 794,    // A4 width at 96dpi
  pageHeight = 1123,  // A4 height at 96dpi
  marginMM = 25.4,    // 1 inch / 2.54cm
  headerText, footerText, showPageNumbers = true,
  className = '', style,
}: PaginatedDocumentViewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<string[]>(['']);
  const marginPx = marginMM * MM_TO_PX;
  const contentHeight = pageHeight - 2 * marginPx;

  // Split content into pages based on estimated line count
  const paginateContent = useCallback(() => {
    if (!contentRef.current) return;
    const container = contentRef.current;
    const totalHeight = container.scrollHeight;

    if (totalHeight <= contentHeight) {
      setPages(['all']);
      return;
    }

    // Approximate page count
    const pageCount = Math.ceil(totalHeight / contentHeight);
    setPages(Array.from({ length: pageCount }, (_, i) => String(i)));
  }, [contentHeight]);

  useEffect(() => {
    // Re-paginate when editor content changes
    const timer = setTimeout(paginateContent, 100);
    return () => clearTimeout(timer);
  }, [children, paginateContent]);

  // Listen for editor updates
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      setTimeout(paginateContent, 100);
    };
    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor, paginateContent]);

  const isSinglePage = pages.length === 1 && pages[0] === 'all';

  return (
    <div className={className} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '24px', padding: '24px 0',
      background: 'hsl(220, 10%, 25%)', // Dark desk surface
      minHeight: '100%',
      ...style,
    }}>
      {isSinglePage ? (
        /* Single page — no pagination needed */
        <div style={pageStyle(pageWidth, pageHeight)}>
          {/* Header */}
          {headerText && (
            <div style={headerFooterStyle(marginPx, 'header')}>
              <span>{headerText}</span>
            </div>
          )}
          {/* Content */}
          <div style={{
            padding: `${marginPx}px`,
            paddingTop: headerText ? `${marginPx * 0.6}px` : `${marginPx}px`,
            paddingBottom: footerText ? `${marginPx * 0.6}px` : `${marginPx}px`,
            minHeight: contentHeight,
            color: '#1a1a1a',
          }}>
            <div ref={contentRef}>
              {children}
            </div>
          </div>
          {/* Footer */}
          {footerText && (
            <div style={headerFooterStyle(marginPx, 'footer')}>
              <span>{footerText}</span>
              {showPageNumbers && <span>1</span>}
            </div>
          )}
        </div>
      ) : (
        /* Multi-page — render each page with CSS page-break simulation */
        <div style={pageStyle(pageWidth, pageHeight * pages.length)}>
          {/* Header */}
          {headerText && (
            <div style={headerFooterStyle(marginPx, 'header')}>
              <span>{headerText}</span>
            </div>
          )}
          {/* Content with page breaks */}
          <div style={{
            padding: `${marginPx}px`,
            paddingTop: headerText ? `${marginPx * 0.6}px` : `${marginPx}px`,
            paddingBottom: footerText ? `${marginPx * 0.6}px` : `${marginPx}px`,
            color: '#1a1a1a',
          }}>
            <div ref={contentRef}>
              {children}
            </div>
            {/* Visual page breaks */}
            {pages.length > 1 && pages.slice(1).map((_, i) => (
              <div key={i} style={{
                borderTop: '2px dashed hsl(220, 10%, 70%)',
                margin: `${marginPx}px 0`,
                paddingTop: `${marginPx}px`,
                position: 'relative',
              }}>
                <span style={{
                  position: 'absolute', top: '-10px', right: '0',
                  fontSize: '10px', color: 'hsl(220, 10%, 55%)',
                  background: '#ffffff', padding: '0 8px',
                }}>
                  Page {i + 2}
                </span>
                {/* Page header (2nd+ pages) */}
                {headerText && (
                  <div style={{
                    fontSize: '10px', color: 'hsl(220, 10%, 55%)',
                    textAlign: 'center', marginBottom: `${marginPx * 0.5}px`,
                  }}>
                    {headerText}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Footer */}
          {(footerText || showPageNumbers) && (
            <div style={headerFooterStyle(marginPx, 'footer')}>
              <span>{footerText ?? ''}</span>
              {showPageNumbers && <span>{pages.length} pages</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pageStyle(width: number, height: number): CSSProperties {
  return {
    width: `${width}px`,
    minHeight: `${height}px`,
    background: '#ffffff',
    boxShadow: '0 2px 12px hsla(225, 30%, 5%, 0.6), 0 0 0 1px hsla(220, 20%, 80%, 0.3)',
    borderRadius: '2px',
    position: 'relative',
    overflow: 'hidden',
  };
}

function headerFooterStyle(marginPx: number, position: 'header' | 'footer'): CSSProperties {
  return {
    display: 'flex', justifyContent: 'space-between',
    padding: `${marginPx * 0.3}px ${marginPx}px`,
    fontSize: '10px', color: 'hsl(220, 10%, 55%)',
    borderBottom: position === 'header' ? '1px solid hsl(220, 10%, 90%)' : 'none',
    borderTop: position === 'footer' ? '1px solid hsl(220, 10%, 90%)' : 'none',
    position: 'absolute',
    [position === 'header' ? 'top' : 'bottom']: 0,
    left: 0, right: 0,
    background: '#ffffff',
  };
}
