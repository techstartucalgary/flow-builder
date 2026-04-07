'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

export default function PdfViewer({
  fileUrl,
  pageNumber,
  onLoadNumPages,
  zoom = 1,
}: {
  fileUrl: string;
  pageNumber: number;
  onLoadNumPages: (n: number) => void;
  zoom?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [intrinsicSize, setIntrinsicSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  /* Track container size with ResizeObserver */
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Store intrinsic (scale-1) page dimensions once */
  const handlePageLoad = useCallback((page: any) => {
    const vp = page.getViewport({ scale: 1 });
    setIntrinsicSize((prev) => {
      if (prev && prev.width === vp.width && prev.height === vp.height)
        return prev;
      return { width: vp.width, height: vp.height };
    });
  }, []);

  /*
   * renderWidth = the CSS-pixel width to hand to <Page width={}>.
   *
   * At zoom 1 the page fits entirely inside the container (both axes).
   * At zoom > 1 the page grows beyond the container and scrolls.
   *
   * Using the `width` prop instead of `scale` is the most reliable way
   * to force pdfjs to re-rasterise the canvas at higher resolution,
   * regardless of pdfjs-dist version quirks.
   */
  const renderWidth = useMemo(() => {
    if (
      !containerSize.width ||
      !containerSize.height ||
      !intrinsicSize
    )
      return undefined; // let react-pdf decide until we know sizes

    const aspect = intrinsicSize.width / intrinsicSize.height;
    const containerAspect = containerSize.width / containerSize.height;

    // "fit" width: the width at which the page exactly fills the container
    const fitWidth =
      aspect > containerAspect
        ? containerSize.width // width-constrained
        : containerSize.height * aspect; // height-constrained

    return fitWidth * zoom;
  }, [containerSize, intrinsicSize, zoom]);

  return (
    <div
      ref={wrapRef}
      className={`w-full h-full ${
        zoom > 1 ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center'
      }`}
    >
      <Document
        file={fileUrl}
        onLoadSuccess={(info) => onLoadNumPages(info.numPages)}
        loading={
          <div className="text-gray-400 p-4">Loading&hellip;</div>
        }
      >
        <Page
          pageNumber={pageNumber}
          width={renderWidth}
          onLoadSuccess={handlePageLoad}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </Document>
    </div>
  );
}
