/**
 * MotorSelector.jsx
 * Selector de componentes para circuitos de motores: tensión + fases + potencia → lista de
 * componentes (calculada en Rust/WASM, ver motor-core). El usuario arma su lista de materiales
 * con varios motores y la exporta a PDF o la copia como JSON para el cotizador.
 */

import { useEffect, useMemo, useState } from "react";
import { buildClipboardPayload, consolidate, copyText, exportPDF, motorSummary } from "../logic/materials";

// ─── Constantes de configuración ────────────────────────────────────────────

const MAIN_SITE_URL = "https://www.dplmexico.com";
const GITHUB_REPO_URL = "https://github.com/DPLmexico/DPL_EMotors";
const STORAGE_ENTRIES = "dpl-emotors:entries";
const STORAGE_PROVEEDOR = "dpl-emotors:proveedor";

function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const fmtMotor = (m) => `${m.hp} HP  ·  ${m.kw} kW  ·  ${m.amps} A`;

// ─── Componente principal ────────────────────────────────────────────────────

export default function MotorSelector({ core }) {
  const [brandIdx, setBrandIdx] = useState(0);
  const brand = core.brands[brandIdx];

  const [voltage, setVoltage] = useState(brand.charts[0].voltage);
  const [phases, setPhases] = useState(brand.charts[0].phases);
  const [motorIdx, setMotorIdx] = useState(0);
  const [starterIdx, setStarterIdx] = useState(0);
  const [extrasMask, setExtrasMask] = useState(0);
  const [coilIdx, setCoilIdx] = useState(brand.charts[0].defaultCoil);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(1);
  const [edits, setEdits] = useState({ key: "", off: {}, qty: {} });

  const [entries, setEntries] = useState(() => loadStored(STORAGE_ENTRIES, []));
  const [proveedor, setProveedor] = useState(() => loadStored(STORAGE_PROVEEDOR, brand.name));
  // Mensaje breve junto a la acción que lo generó: "add" (agregar) o "list" (exportar).
  const [status, setStatus] = useState(null);

  useEffect(() => localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries)), [entries]);
  useEffect(() => localStorage.setItem(STORAGE_PROVEEDOR, JSON.stringify(proveedor)), [proveedor]);

  // ── Tabla activa ──
  const voltages = [...new Set(brand.charts.map((c) => c.voltage))];
  const phasesFor = (v) => brand.charts.filter((c) => c.voltage === v).map((c) => c.phases);
  const chartIdx = brand.charts.findIndex((c) => c.voltage === voltage && c.phases === phases);
  const chart = brand.charts[chartIdx];

  // Cambia de tabla conservando la potencia si existe en la nueva (o la siguiente mayor).
  const changeChart = (b, v, p) => {
    const nextBrand = core.brands[b];
    const valid = nextBrand.charts.filter((c) => c.voltage === v);
    const target = valid.find((c) => c.phases === p) ?? valid[0] ?? nextBrand.charts[0];
    const hp = chart?.motors[motorIdx]?.hp ?? 0;
    const idx = target.motors.findIndex((m) => m.hp >= hp);
    setBrandIdx(b);
    setVoltage(target.voltage);
    setPhases(target.phases);
    setMotorIdx(idx === -1 ? target.motors.length - 1 : idx);
    setCoilIdx(target.defaultCoil);
    if (b !== brandIdx) {
      setStarterIdx(0);
      setExtrasMask(0);
    }
  };

  // Los extras exclusivos de trifásico no se envían en monofásico.
  const effectiveMask = brand.extras.reduce(
    (mask, x, i) => (x.threePhaseOnly && phases !== 3 ? mask & ~(1 << i) : mask),
    extrasMask,
  );

  const result = useMemo(
    () => core.select(brandIdx, chartIdx, motorIdx, starterIdx, effectiveMask, coilIdx),
    [core, brandIdx, chartIdx, motorIdx, starterIdx, effectiveMask, coilIdx],
  );

  // Ediciones del usuario (quitar partidas / cambiar cantidades) para la selección actual.
  const selKey = `${brandIdx}|${chartIdx}|${motorIdx}|${starterIdx}|${effectiveMask}|${coilIdx}`;
  const cur = edits.key === selKey ? edits : { key: selKey, off: {}, qty: {} };
  const items = (result.items ?? []).map((it, i) => ({
    ...it,
    included: !cur.off[i],
    qty: cur.qty[i] ?? it.qty,
  }));
  const toggleItem = (i) => setEdits({ ...cur, off: { ...cur.off, [i]: !cur.off[i] } });
  const setItemQty = (i, q) => setEdits({ ...cur, qty: { ...cur.qty, [i]: Math.max(0, q) } });

  const motor = chart?.motors[motorIdx];
  const selectedItems = items.filter((it) => it.included && it.qty > 0);

  const addToList = () => {
    if (!motor || !selectedItems.length) return;
    const entry = {
      id: newId(),
      label: label.trim(),
      count: Math.max(1, count),
      brand: brand.id,
      brandName: brand.name,
      chartLabel: chart.label,
      motor,
      starterLabel: brand.starters[starterIdx].label,
      coilLabel: brand.coils[coilIdx]?.label ?? "",
      extras: brand.extras.filter((_, i) => effectiveMask & (1 << i)).map((x) => x.label),
      items: selectedItems.map(({ category, part, description, unit, qty, note }) => ({
        category, part, description, unit, qty, note,
      })),
    };
    setEntries((prev) => [...prev, entry]);
    setLabel("");
    setCount(1);
    setEdits({ key: "", off: {}, qty: {} });
    flash("add", `Motor agregado a la lista (${entries.length + 1})`);
  };

  const flash = (where, msg) => {
    const next = { where, msg };
    setStatus(next);
    setTimeout(() => setStatus((s) => (s === next ? null : s)), 2500);
  };

  const onCopyJSON = async () => {
    try {
      await copyText(JSON.stringify(buildClipboardPayload(entries, proveedor.trim())));
      flash("list", "JSON copiado al portapapeles");
    } catch (err) {
      flash("list", err.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const notes = items.filter((it) => it.included && it.note);

  return (
    <div className="min-h-screen bg-black p-3 font-body text-text-base md:p-4">
      <div className="mx-auto max-w-6xl space-y-3">

        <Header />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">

          {/* Panel de selección */}
          <div className="space-y-3 rounded-xl border border-border-custom bg-surface p-4">
            <SectionLabel>Datos del motor</SectionLabel>

            {core.brands.length > 1 && (
              <SelectField label="Marca" value={brandIdx} onChange={(v) => changeChart(Number(v), voltage, phases)}>
                {core.brands.map((b, i) => <option key={b.id} value={i}>{b.name}</option>)}
              </SelectField>
            )}
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="Tensión" value={voltage} onChange={(v) => changeChart(brandIdx, v, phases)}>
                {voltages.map((v) => <option key={v} value={v}>{v}</option>)}
              </SelectField>
              <div>
                <FieldLabel>Fases</FieldLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {[1, 3].map((p) => {
                    const available = phasesFor(voltage).includes(p);
                    return (
                      <ChoiceButton
                        key={p}
                        active={phases === p}
                        disabled={!available}
                        title={available ? "" : `No disponible en ${voltage}`}
                        onClick={() => changeChart(brandIdx, voltage, p)}
                      >
                        {p === 1 ? "1φ" : "3φ"}
                      </ChoiceButton>
                    );
                  })}
                </div>
              </div>
            </div>
            <SelectField label="Potencia" value={motorIdx} onChange={(v) => setMotorIdx(Number(v))}>
              {chart.motors.map((m, i) => <option key={i} value={i}>{fmtMotor(m)}</option>)}
            </SelectField>

            <SectionLabel>Arrancador</SectionLabel>
            <div className="grid gap-1.5">
              {brand.starters.map((s, i) => (
                <ChoiceButton key={s.id} active={starterIdx === i} onClick={() => setStarterIdx(i)}>
                  {s.label}
                </ChoiceButton>
              ))}
            </div>
            {brand.coils.length > 0 && (
              <SelectField label="Voltaje de control (bobina)" value={coilIdx} onChange={(v) => setCoilIdx(Number(v))}>
                {brand.coils.map((c, i) => <option key={c.id} value={i}>{c.label}</option>)}
              </SelectField>
            )}
            <div className="flex flex-wrap gap-1.5">
              {brand.extras.map((x, i) => {
                const disabled = x.threePhaseOnly && phases !== 3;
                return (
                  <ToggleChip
                    key={x.id}
                    active={!disabled && Boolean(extrasMask & (1 << i))}
                    disabled={disabled}
                    title={disabled ? "Solo trifásico" : ""}
                    onClick={() => setExtrasMask((m) => m ^ (1 << i))}
                  >
                    {x.label}
                  </ToggleChip>
                );
              })}
            </div>
          </div>

          {/* Resultado */}
          <div className="flex flex-col rounded-xl border border-border-custom bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-custom pb-2">
              <span className="font-display text-xs font-bold uppercase tracking-widest text-text-muted">
                Componentes — {brand.name} · {chart.label}
              </span>
              {motor && (
                <span className="font-display text-lg font-bold leading-none text-green">
                  {motor.hp}<Unit>HP</Unit> · {motor.kw}<Unit>kW</Unit> · {motor.amps}<Unit>A</Unit>
                </span>
              )}
            </div>

            <ErrorCard error={result.error} />

            <div className="mt-1 flex-1 divide-y divide-border-custom/60">
              {items.map((it, i) => (
                <ComponentRow
                  key={`${selKey}-${i}`}
                  item={it}
                  onToggle={() => toggleItem(i)}
                  onQty={(q) => setItemQty(i, q)}
                />
              ))}
            </div>

            {notes.length > 0 && (
              <div className="mt-2 space-y-0.5 rounded border border-amber-500/40 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-300">
                {notes.map((it) => <div key={it.part}>⚠ <b>{it.part}:</b> {it.note}</div>)}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-custom pt-3">
              <div className="min-w-40 flex-1">
                <TextInput label="Identificador (opcional)" value={label} onChange={setLabel} placeholder="p. ej. Bomba de agua 1" />
              </div>
              <div className="w-24">
                <NumberInput label="Motores" value={count} onChange={(v) => setCount(Math.max(1, Math.round(v) || 1))} min={1} step={1} unit="×" />
              </div>
              <button
                onClick={addToList}
                disabled={!selectedItems.length}
                className="h-[34px] rounded-lg border border-green bg-green/10 px-4 font-display text-sm font-semibold uppercase tracking-wider text-green transition hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Agregar a la lista
              </button>
            </div>
            {status?.where === "add" && (
              <p className="mt-2 font-display text-xs uppercase tracking-widest text-green">{status.msg}</p>
            )}
          </div>
        </div>

        {/* Lista de materiales */}
        {entries.length > 0 && (
          <MaterialsPanel
            entries={entries}
            proveedor={proveedor}
            setProveedor={setProveedor}
            status={status?.where === "list" ? status.msg : ""}
            onCount={(id, n) => setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, count: n } : e)))}
            onRemove={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
            onClear={() => setEntries([])}
            onExportPDF={() => exportPDF(entries, proveedor.trim())}
            onCopyJSON={onCopyJSON}
          />
        )}

        <Footer />
      </div>
    </div>
  );
}

// ─── Header / Footer ──────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex items-center gap-4 rounded-xl border border-border-custom bg-surface px-4 py-3">
      <a href={MAIN_SITE_URL} aria-label="Volver a DPL México" className="shrink-0">
        <img src={`${import.meta.env.BASE_URL}dpl-logo.png`} alt="DPL México" className="h-6 w-auto" />
      </a>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-lg font-bold uppercase leading-tight tracking-wide text-green md:text-xl">
          Selector de Componentes para Motores
        </h1>
        <p className="hidden text-xs text-text-muted sm:block">Arrancadores y protecciones de motores 60 Hz — v1.0</p>
      </div>
      <a
        href={MAIN_SITE_URL}
        className="hidden shrink-0 font-display text-xs font-semibold uppercase tracking-widest text-text-muted transition hover:text-green sm:block"
      >
        ← Volver al sitio
      </a>
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="px-4 py-2 text-center">
      <p className="text-xs leading-relaxed text-text-muted">
        © {year} DPL México. Selección basada en tablas del fabricante — verifica siempre contra los datos
        de placa del motor y la normativa vigente (NOM) antes de comprar o instalar.
      </p>
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block font-display text-xs font-semibold uppercase tracking-widest text-text-muted transition hover:text-green"
      >
        Código en GitHub ↗
      </a>
    </footer>
  );
}

// ─── Lista de componentes ────────────────────────────────────────────────────

function ComponentRow({ item, onToggle, onQty }) {
  return (
    <div
      className={`flex items-center gap-3 py-1.5 transition ${item.included ? "" : "opacity-40"}`}
      title={item.description}
    >
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-green"
        checked={item.included}
        onChange={onToggle}
        aria-label={`Incluir ${item.part}`}
      />
      <span className="hidden w-40 shrink-0 truncate font-display text-[11px] uppercase tracking-widest text-text-muted sm:block">
        {item.category}
      </span>
      <div className="min-w-0 flex-1 md:flex md:items-baseline md:gap-3">
        <div className="shrink-0 font-display text-base font-bold leading-tight text-green md:w-40">
          {item.part}{item.note && <span className="ml-1 text-amber-400" title={item.note}>⚠</span>}
        </div>
        <div className="truncate text-xs text-text-muted">{item.description}</div>
      </div>
      <input
        type="number"
        min={0}
        step={1}
        value={item.qty}
        disabled={!item.included}
        onChange={(e) => onQty(Math.round(Number(e.target.value)) || 0)}
        className="w-12 shrink-0 rounded-md border border-border-custom bg-black/30 px-1.5 py-1 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none text-sm text-text-base outline-none transition focus:border-green-dim focus:ring-2 focus:ring-green-soft"
        aria-label={`Cantidad de ${item.part}`}
      />
      <span className="w-7 shrink-0 text-[10px] uppercase text-text-muted">{item.unit}</span>
    </div>
  );
}

// ─── Panel lista de materiales ────────────────────────────────────────────────

function MaterialsPanel({ entries, proveedor, setProveedor, status, onCount, onRemove, onClear, onExportPDF, onCopyJSON }) {
  const total = consolidate(entries);
  return (
    <div className="rounded-xl border border-border-custom bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-green">
          Lista de materiales ({entries.length} {entries.length === 1 ? "motor" : "motores"})
        </h2>
        <div className="flex gap-2">
          <ExportButton onClick={onExportPDF} label="↓ PDF" />
          <ExportButton onClick={onCopyJSON} label="⧉ Copiar JSON" />
          <button
            onClick={() => window.confirm("¿Borrar toda la lista de materiales?") && onClear()}
            className="rounded-lg border border-border-custom px-3 py-1.5 font-display text-xs font-semibold uppercase text-text-muted transition hover:border-red-500 hover:text-red-400"
          >
            Limpiar
          </button>
        </div>
      </div>
      {status && <p className="-mt-2 mb-3 font-display text-xs uppercase tracking-widest text-green">{status}</p>}

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {entries.map((e, i) => (
          <div key={e.id} className="rounded-lg border border-border-custom bg-surface2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-green">
                  #{String(i + 1).padStart(2, "0")} {e.label || "Motor"} — {e.brandName} · {e.chartLabel}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {motorSummary(e)} · {e.starterLabel}{e.coilLabel && ` · Control ${e.coilLabel}`}{e.extras.length > 0 && ` · ${e.extras.join(", ")}`}
                </div>
                <div className="mt-1 text-xs text-text-base">{e.items.map((it) => `${it.qty}× ${it.part}`).join("  ·  ")}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-text-muted">×</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={e.count}
                  onChange={(ev) => onCount(e.id, Math.max(1, Math.round(Number(ev.target.value)) || 1))}
                  className="w-14 rounded-lg border border-border-custom bg-black/30 p-1 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none text-sm text-text-base outline-none focus:border-green-dim"
                  aria-label="Cantidad de motores"
                />
                <button
                  onClick={() => onRemove(e.id)}
                  className="rounded px-1.5 text-text-muted transition hover:text-red-400"
                  aria-label="Quitar motor"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <SectionLabel>Consolidado ({total.length} partidas)</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="font-display uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-1.5 pr-3">No. catálogo</th>
                <th className="py-1.5 pr-3">Descripción</th>
                <th className="py-1.5 text-right">Cant.</th>
              </tr>
            </thead>
            <tbody>
              {total.map((it) => (
                <tr key={`${it.brand}|${it.part}`} className="border-t border-border-custom">
                  <td className="py-1.5 pr-3 font-display text-sm font-semibold whitespace-nowrap text-green">{it.part}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{it.description}</td>
                  <td className="py-1.5 text-right font-display text-sm font-semibold whitespace-nowrap">
                    {it.qty} <span className="text-[10px] font-normal text-text-muted">{it.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="max-w-xs">
          <TextInput label="Proveedor (para el JSON)" value={proveedor} onChange={setProveedor} />
        </div>
      </div>
    </div>
  );
}

// ─── Primitivas de UI ────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="font-display text-xs font-bold uppercase tracking-widest text-text-muted border-b border-border-custom pb-1.5">
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="mb-1 block text-xs text-text-muted">{children}</label>;
}

function Unit({ children }) {
  return <span className="ml-0.5 text-xs font-normal text-text-muted">{children}</span>;
}

const FIELD = "w-full rounded-lg border border-border-custom bg-surface2 px-2 py-1.5 text-sm text-text-base outline-none transition focus:border-green-dim focus:ring-2 focus:ring-green-soft";

function SelectField({ label, value, onChange, children }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

function ChoiceButton({ active, onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-[34px] rounded-lg border px-3 font-display text-xs font-semibold uppercase tracking-wider transition
        ${active
          ? "border-green bg-green/10 text-green"
          : "border-border-custom bg-surface2 text-text-muted enabled:hover:border-green-dim enabled:hover:text-text-base"}
        disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

function ToggleChip({ active, onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-xs transition
        ${active
          ? "border-green bg-green/10 text-green"
          : "border-border-custom bg-surface2 text-text-muted enabled:hover:border-green-dim enabled:hover:text-text-base"}
        disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {active ? "✓ " : "+ "}{children}
    </button>
  );
}

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        className={`${FIELD} placeholder:text-text-muted/50`}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function NumberInput({ label, value, onChange, unit, min = 0, max, step = 0.1 }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex">
        <input
          className={`${FIELD} rounded-r-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {unit && (
          <span className="flex items-center rounded-r-lg border border-l-0 border-border-custom bg-surface2 px-2 font-display text-xs font-semibold text-green">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ error }) {
  if (!error) return null;
  return (
    <div className="mt-2 rounded-lg border border-red-500 bg-red-900/20 p-2 text-sm text-red-400">
      {error}
    </div>
  );
}

function ExportButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-green px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-green transition hover:bg-green/10"
    >
      {label}
    </button>
  );
}
