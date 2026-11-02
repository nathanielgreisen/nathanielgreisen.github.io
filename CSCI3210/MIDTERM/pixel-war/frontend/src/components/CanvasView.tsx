import { useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';

interface Drag {
  id: number; startX: number; startY: number;
  originalX: number; originalY: number; moved: boolean;
}

export default function CanvasView({ canvasRef, width, height, disabled, onPlace }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  width: number; height: number; disabled: boolean;
  onPlace: (x: number, y: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<Drag | null>(null);
  const changeZoom = (factor: number) => setZoom(value => Math.min(8, Math.max(0.5, value * factor)));

  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
      originalX: pan.x, originalY: pan.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.hypot(dx, dy) > 4) active.moved = true;
    if (active.moved) setPan({ x: active.originalX + dx, y: active.originalY + dy });
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = active.moved || Math.hypot(
      event.clientX - active.startX, event.clientY - active.startY,
    ) > 4;
    if (moved || disabled || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * height / rect.height);
    if (x >= 0 && y >= 0 && x < width && y < height) onPlace(x, y);
  }
  function shift(x: number, y: number) { setPan(value => ({ x: value.x + x, y: value.y + y })); }

  return <div>
    <p>Click to place. Drag to pan. Use the wheel or buttons to zoom.</p>
    <div className="controls" aria-label="Canvas navigation">
      <button type="button" onClick={() => changeZoom(1.25)} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => changeZoom(0.8)} aria-label="Zoom out">−</button>
      <button type="button" onClick={() => shift(50, 0)} aria-label="Move canvas right">Right</button>
      <button type="button" onClick={() => shift(-50, 0)} aria-label="Move canvas left">Left</button>
      <button type="button" onClick={() => shift(0, -50)} aria-label="Move canvas up">Up</button>
      <button type="button" onClick={() => shift(0, 50)} aria-label="Move canvas down">Down</button>
      <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
      <span>Zoom: {zoom.toFixed(2)}×</span>
    </div>
    <div className="viewport" onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={event => changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)}>
      <div className="canvas-transform"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <canvas ref={canvasRef} width={width} height={height} className="pixel-canvas"
          aria-label="Shared pixel canvas. Use coordinate inputs below for keyboard placement." />
      </div>
    </div>
  </div>;
}
