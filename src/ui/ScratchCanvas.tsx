import { useCallback, useEffect, useRef } from 'react';

/**
 * Canvas scratch surface.
 *
 * The visible foil is drawn into a canvas and erased with
 * `globalCompositeOperation = 'destination-out'`. Coverage is estimated with a
 * coarse boolean grid rather than reading back pixels on every pointer move.
 *
 * The logical card outcome lives entirely in the game state; this component
 * only reports how much of the surface has been removed.
 */

const GRID = 14;
const BRUSH_RADIUS = 18;

export interface ScratchCanvasProps {
  /** Changing this resets the foil. */
  cardId: string;
  /** 0..1 logical progress from the game state. */
  progress: number;
  revealed: boolean;
  reducedMotion: boolean;
  /** Called with the newly scratched fraction of the surface. */
  onScratch: (delta: number) => void;
  label: string;
}

export function ScratchCanvas({
  cardId,
  progress,
  revealed,
  reducedMotion,
  onScratch,
  label,
}: ScratchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<Uint8Array>(new Uint8Array(GRID * GRID));
  const coveredRef = useRef(0);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerRef = useRef<number | null>(null);

  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (revealed) return;

    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, '#8c8f99');
    gradient.addColorStop(0.35, '#c7cbd6');
    gradient.addColorStop(0.5, '#eceef5');
    gradient.addColorStop(0.65, '#b9bdc9');
    gradient.addColorStop(1, '#7d808a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Simple deterministic speckle so the foil does not look flat.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 160; i++) {
      const x = ((i * 73) % 97) / 97;
      const y = ((i * 131) % 89) / 89;
      ctx.fillRect(x * rect.width, y * rect.height, 2, 2);
    }
    ctx.fillStyle = 'rgba(40,40,50,0.18)';
    for (let i = 0; i < 90; i++) {
      const x = ((i * 53) % 71) / 71;
      const y = ((i * 97) % 83) / 83;
      ctx.fillRect(x * rect.width, y * rect.height, 3, 1);
    }

    ctx.fillStyle = 'rgba(30,30,40,0.55)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('scratch here', rect.width / 2, rect.height / 2);
  }, [revealed]);

  // Reset whenever a different card is shown.
  useEffect(() => {
    gridRef.current = new Uint8Array(GRID * GRID);
    coveredRef.current = 0;
    paintFoil();
  }, [cardId, paintFoil]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const repaint = () => {
      paintFoil();
      // Re-apply already scratched cells after a resize.
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      if (!ctx || revealed) return;
      ctx.globalCompositeOperation = 'destination-out';
      for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
          if (!gridRef.current[gy * GRID + gx]) continue;
          ctx.fillRect(
            (gx / GRID) * rect.width,
            (gy / GRID) * rect.height,
            rect.width / GRID + 1,
            rect.height / GRID + 1,
          );
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    // ResizeObserver is not available in every environment (older browsers,
    // server-side rendering, tests), so fall back to window resize events.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', repaint);
      return () => window.removeEventListener('resize', repaint);
    }
    const observer = new ResizeObserver(repaint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paintFoil, revealed]);

  useEffect(() => {
    if (revealed) paintFoil();
  }, [revealed, paintFoil]);

  const markCoverage = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const grid = gridRef.current;
      const cellW = width / GRID;
      const cellH = height / GRID;
      const minX = Math.max(0, Math.floor((x - BRUSH_RADIUS) / cellW));
      const maxX = Math.min(GRID - 1, Math.floor((x + BRUSH_RADIUS) / cellW));
      const minY = Math.max(0, Math.floor((y - BRUSH_RADIUS) / cellH));
      const maxY = Math.min(GRID - 1, Math.floor((y + BRUSH_RADIUS) / cellH));
      let added = 0;
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const index = gy * GRID + gx;
          if (grid[index]) continue;
          grid[index] = 1;
          added++;
        }
      }
      if (added > 0) {
        coveredRef.current += added;
        onScratch(added / (GRID * GRID));
      }
    },
    [onScratch],
  );

  const erase = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || revealed) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = BRUSH_RADIUS * 2;
      const last = lastPointRef.current;
      ctx.beginPath();
      if (last) {
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      lastPointRef.current = { x, y };
      markCoverage(x, y, rect.width, rect.height);
    },
    [markCoverage, revealed],
  );

  const endStroke = useCallback(() => {
    drawingRef.current = false;
    lastPointRef.current = null;
    activePointerRef.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="scratch-canvas"
      aria-hidden="true"
      data-reduced={reducedMotion ? 'true' : 'false'}
      data-label={label}
      style={{ opacity: revealed ? 0 : 1, pointerEvents: revealed ? 'none' : 'auto' }}
      onPointerDown={(event) => {
        if (revealed) return;
        activePointerRef.current = event.pointerId;
        drawingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        erase(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!drawingRef.current || activePointerRef.current !== event.pointerId) return;
        erase(event.clientX, event.clientY);
      }}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => {
        if (drawingRef.current) endStroke();
      }}
      onLostPointerCapture={endStroke}
      data-progress={progress.toFixed(2)}
    />
  );
}
