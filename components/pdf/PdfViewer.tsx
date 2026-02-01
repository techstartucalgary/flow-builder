'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

export default function PdfViewer({
  fileUrl,
  pageNumber,
  onLoadNumPages,
}: {
  fileUrl: string;
  pageNumber: number;
  onLoadNumPages: (n: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(900);

  useEffect(() => {
    if (!wrapRef.current) return;

    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // subtract a bit so it doesn’t touch edges
      setPageWidth(Math.max(320, w - 12));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full flex items-center justify-center">
      <Document
        file={fileUrl}
        onLoadSuccess={(info) => onLoadNumPages(info.numPages)}
        loading={<div className="text-gray-400">Loading…</div>}
      >
        <Page
          pageNumber={pageNumber}
          width={pageWidth}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </Document>
    </div>
  );
}
