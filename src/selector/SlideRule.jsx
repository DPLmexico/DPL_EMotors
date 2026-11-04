/**
 * SlideRule.jsx
 * Regla de selección deslizable, como las de cartón de los proveedores: un cartón interior con
 * la escala de HP que se arrastra bajo una flecha fija, y ventanitas que muestran el
 * componente de cada categoría para el motor alineado. Horizontal en escritorio, vertical en
 * celular. Se maneja con arrastre (mouse/dedo), rueda, flechas del teclado o clic en la escala.
 */

import { useEffect, useRef, useState } from "react";

// Solo fracciones que trae la fuente Barlow (⅙ no viene y saldría como cuadrito).
const FRACTIONS = { 0.17: "1/6", 0.25: "¼", 0.33: "⅓", 0.5: "½", 0.75: "¾", 1.5: "1½", 7.5: "7½" };
const fmtHp = (hp) => FRACTIONS[hp] ?? String(hp);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function useIsVertical() {
  const query = "(max-width: 767px)";
  const [vertical, setVertical] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setVertical(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return vertical;
}

export default function SlideRule({
  brand, chart, table, index, onIndex, sideLabel, flipKey, onFlip, flipLabel, notes, coils, coil, onCoil,
}) {
  const vertical = useIsVertical();
  const motors = chart.motors;
  const n = motors.length;
  const tick = vertical ? 46 : 68; // px por tamaño en la escala

  // Posición continua mientras se arrastra; si no, la del motor elegido.
  const [dragPos, setDragPos] = useState(null);
  const pos = dragPos ?? index;
  const drag = useRef(null);
  const stripRef = useRef(null);

  const select = (i) => onIndex(clamp(Math.round(i), 0, n - 1));

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: vertical ? e.clientY : e.clientX, startPos: index, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const delta = (vertical ? e.clientY : e.clientX) - d.start;
    if (Math.abs(delta) > 4) d.moved = true;
    if (!d.moved) return;
    // Jalar el cartón hacia atrás trae los tamaños mayores bajo la flecha.
    const p = clamp(d.startPos - delta / tick, 0, n - 1);
    setDragPos(p);
    if (Math.round(p) !== index) select(p);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-tick]");
      if (hit) select(Number(hit.dataset.tick));
    }
    setDragPos(null);
  };

  // Rueda: un tamaño por "muesca". Listener nativo para poder evitar el scroll de la página.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    let last = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const now = Date.now();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (now - last < 70 || Math.abs(delta) < 2) return;
      last = now;
      onIndex(clamp(index + Math.sign(delta), 0, n - 1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [index, n, onIndex]);

  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[e.key];
    if (step) select(index + step);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(n - 1);
    else return;
    e.preventDefault();
  };

  const motor = motors[index];
  const animate = dragPos === null ? "transition-transform duration-300 ease-out" : "";
  const offset = pos * tick + tick / 2;

  const strip = (
    <div
      ref={stripRef}
      role="slider"
      tabIndex={0}
      aria-label="Potencia del motor"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={index}
      aria-valuetext={`${motor.hp} HP, ${motor.kw} kW, ${motor.amps} A`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`relative shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-lg border-2 border-neutral-800 bg-[#f7f1e1] outline-none focus-visible:ring-4 focus-visible:ring-green-soft active:cursor-grabbing
        ${vertical ? "w-[5.5rem] self-stretch" : "h-[4.5rem] w-full"}`}
      style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 3px, rgba(120,100,60,.05) 3px 4px)" }}
    >
      {/* Cartón interior con la escala */}
      <div
        className={`absolute flex ${vertical ? "left-0 right-0 top-1/2 flex-col" : "top-0 bottom-0 left-1/2"} ${animate}`}
        style={{ transform: vertical ? `translateY(${-offset}px)` : `translateX(${-offset}px)` }}
      >
        {motors.map((m, i) => (
          <div
            key={i}
            data-tick={i}
            className={`flex shrink-0 flex-col items-center justify-center border-neutral-500 ${vertical ? "border-b" : "border-r"}
              ${i === index ? "text-green" : "text-neutral-800"}`}
            style={vertical ? { height: tick } : { width: tick }}
          >
            <span className="font-display text-xl font-bold leading-none">{fmtHp(m.hp)}</span>
            <span className="text-[9px] uppercase text-neutral-500">{m.kw} kW</span>
          </div>
        ))}
      </div>
      {/* Ventana con la flecha fija */}
      <div
        className={`pointer-events-none absolute border-x-4 border-green ${vertical ? "left-0 right-0 top-1/2 -translate-y-1/2 border-x-0 border-y-4" : "top-0 bottom-0 left-1/2 -translate-x-1/2"}`}
        style={vertical ? { height: tick } : { width: tick }}
      />
      <div className={`pointer-events-none absolute text-green ${vertical ? "left-0 top-1/2 -translate-y-1/2 text-xs" : "bottom-0 left-1/2 -translate-x-1/2 text-xs leading-none"}`}>
        {vertical ? "→" : "▲"}
      </div>
    </div>
  );

  const windows = table && !table.error && (
    <div
      key={flipKey}
      className={`grid gap-2 ${vertical ? "flex-1 grid-cols-1 content-start" : "grid-cols-2 lg:grid-cols-4"}`}
      style={{ animation: `${vertical ? "voltear-v" : "voltear"} 0.35s ease-out` }}
    >
      {table.columns.map((col, c) => (
        <div key={col} className="overflow-hidden rounded-md border-2 border-neutral-800 bg-white">
          <div className="bg-neutral-800 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest text-white">
            {col}
          </div>
          {/* La tira de valores se mueve con el cartón, como si se viera a través de la ventanita */}
          <div className="relative h-9 overflow-hidden">
            <div
              className={`absolute inset-0 flex ${vertical ? "flex-col" : ""} ${animate}`}
              style={{
                transform: vertical ? `translateY(${-pos * 100}%)` : `translateX(${-pos * 100}%)`,
              }}
            >
              {table.rows.map((row, r) => {
                const cell = row[c];
                return (
                  <div
                    key={r}
                    className="flex h-full w-full shrink-0 items-center justify-center gap-1 px-2 font-display text-base font-bold text-neutral-900"
                    title={cell?.note ?? undefined}
                  >
                    {cell ? <span className="truncate">{cell.text}</span> : <span className="text-neutral-400">—</span>}
                    {cell?.note && <span className="text-amber-600">⚠</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl border-2 border-neutral-800 bg-surface p-3 shadow-[4px_4px_0_rgba(0,0,0,.25)] md:p-4">
      {/* Marca de los componentes, bien visible */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-neutral-800 pb-2">
        <span
          className="font-display text-5xl font-bold uppercase leading-none tracking-tight"
          style={{ color: brand.color }}
        >
          {brand.name}
        </span>
        <div className="font-display text-xs font-bold uppercase leading-tight tracking-wider text-text-base">
          Componentes marca <span style={{ color: brand.color }}>{brand.name}</span>
          <div className="text-text-muted">{sideLabel}</div>
        </div>
        {onFlip && (
          <button
            onClick={onFlip}
            className="ml-auto rounded-full border-2 border-neutral-800 bg-white px-3 py-1 font-display text-xs font-bold uppercase tracking-wider text-neutral-900 transition hover:bg-neutral-800 hover:text-white"
          >
            Voltear cartón → {flipLabel}
          </button>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <div className="font-display text-[11px] font-bold uppercase tracking-widest text-text-muted">
            ← Arrastra el cartón · rueda del mouse · flechas →
          </div>
          <div className="font-display text-2xl font-bold leading-tight text-green">
            {motor.hp} <span className="text-sm text-text-muted">HP</span> · {motor.kw}{" "}
            <span className="text-sm text-text-muted">kW</span> · {motor.amps} <span className="text-sm text-text-muted">A</span>
          </div>
        </div>
        {coils?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Voltaje de control de la bobina">
            <span className="mr-1 font-display text-[11px] font-bold uppercase tracking-widest text-text-muted">
              Bobina del contactor:
            </span>
            {coils.map((c, i) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={coil === i}
                onClick={() => onCoil(i)}
                className={`rounded-md border-2 border-neutral-800 px-2 py-0.5 font-display text-xs font-bold transition
                  ${coil === i ? "bg-neutral-800 text-white" : "bg-white text-neutral-900 hover:bg-neutral-100"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={vertical ? "flex gap-3" : "space-y-3"}>
        {strip}
        {windows}
      </div>

      {notes?.length > 0 && (
        <div className="mt-3 space-y-0.5 rounded border border-amber-500/60 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          {notes.map((it) => <div key={it.part}>⚠ <b>{it.part}:</b> {it.note}</div>)}
        </div>
      )}
    </div>
  );
}
