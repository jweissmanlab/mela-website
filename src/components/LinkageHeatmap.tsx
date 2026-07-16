import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { dataUrl, type LinkageData, type LinkageManifest } from '../lib/data';
import LinkageSidebar from './LinkageSidebar';
import './linkage.css';

// RdBu_r diverging ramp (ColorBrewer, reversed): low = blue, high = red
const RDBU_R = [
  '#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7',
  '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f',
];

const STRIP = 12; // lineage strip thickness (css px)
const GAP = 3; // gap between strip and heatmap
const MIN_CELL = 3; // floor (labels shrink but stay visible)
const LABEL_CAP = 172; // max label gutter (css px)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Hover {
  region: 'heat' | 'top' | 'right';
  a: number;
  b: number;
  px: number;
  py: number;
}

export default function LinkageHeatmap() {
  const [manifest, setManifest] = useState<LinkageManifest | null>(null);
  const [stage, setStage] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [data, setData] = useState<LinkageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null); // lineage subset
  const [cell, setCell] = useState<{ ra: number; rb: number } | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [availW, setAvailW] = useState(900);

  const mainRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);
  if (!measureRef.current && typeof document !== 'undefined')
    measureRef.current = document.createElement('canvas').getContext('2d');

  useEffect(() => {
    fetch(dataUrl('linkage/index.json'))
      .then((r) => r.json())
      .then((m: LinkageManifest) => {
        setManifest(m);
        setStage(m.default.stage);
        setLevel(m.default.level);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!stage || !level) return;
    setData(null);
    setCell(null);
    setSel(null);
    fetch(dataUrl(`linkage/${stage}_${level}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [stage, level]);

  // track available width of the heatmap area (drives full-width sizing)
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => setCell(null), [sel]);

  const layout = useMemo(() => {
    if (!data) return null;
    const S = data.subtypes;
    const visIdx = S.map((_, i) => i).filter(
      (i) => !sel || data.lineages[S[i]] === sel
    );
    const n = visIdx.length;
    if (n === 0) return null;
    const posOf = new Map(visIdx.map((orig, p) => [orig, p]));

    const mc = measureRef.current;
    const labelPx = (font: number) => {
      if (!mc) return 90;
      mc.font = `${font}px Inter, sans-serif`;
      let m = 0;
      for (const i of visIdx) {
        const w = mc.measureText(S[i]).width;
        if (w > m) m = w;
      }
      return m;
    };

    const avail = Math.max(280, availW);
    // estimate font from a first-pass cell, then size the label gutters
    const cell0 = Math.max(MIN_CELL, (avail - 110 - STRIP - GAP) / n);
    let font = clamp(Math.floor(cell0) - 1, 3, 11);
    let leftW = Math.min(LABEL_CAP, labelPx(font) + 8);
    // fractional cell that fills the remaining width exactly (1px safety)
    const usable = avail - leftW - STRIP - GAP - 1;
    const cellF = Math.max(MIN_CELL, usable / n);
    font = clamp(Math.floor(cellF) - 1, 3, 11);
    leftW = Math.min(LABEL_CAP, labelPx(font) + 8);
    const bottomH = Math.min(LABEL_CAP, labelPx(font) + 8);

    const hx0 = leftW;
    const hy0 = STRIP + GAP;
    const xAt = (k: number) => Math.round(hx0 + k * cellF);
    const yAt = (k: number) => Math.round(hy0 + k * cellF);
    const gridW = xAt(n) - hx0;
    const gridH = yAt(n) - hy0;
    const cssW = xAt(n) + GAP + STRIP;
    const cssH = yAt(n) + bottomH;

    const { vmin, vmax } = data.scale;
    const colVal = scaleLinear<string>()
      .domain(RDBU_R.map((_, k) => vmin + ((vmax - vmin) * k) / (RDBU_R.length - 1)))
      .range(RDBU_R)
      .clamp(true);

    return {
      visIdx, posOf, n, cellF, font, hx0, hy0, xAt, yAt, gridW, gridH, cssW, cssH, colVal,
    };
  }, [data, sel, availW]);

  // draw heatmap + strips + labels
  useEffect(() => {
    const cv = mainRef.current;
    if (!cv || !layout || !data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, hx0, xAt, yAt, cellF, gridW, n, visIdx, font, colVal } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const S = data.subtypes;
    const colorOf = (i: number) => data.palette[data.lineages[S[i]]] ?? '#ccc';

    for (let a = 0; a < n; a++) {
      const i = visIdx[a];
      const y = yAt(a);
      const h = yAt(a + 1) - y;
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const v = data.value[i][visIdx[b]];
        if (v == null) continue;
        ctx.fillStyle = colVal(v) as string;
        ctx.fillRect(xAt(b), y, xAt(b + 1) - xAt(b), h);
      }
    }

    for (let b = 0; b < n; b++) {
      ctx.fillStyle = colorOf(visIdx[b]);
      ctx.fillRect(xAt(b), 0, xAt(b + 1) - xAt(b), STRIP);
    }
    const rx = xAt(n) + GAP;
    for (let a = 0; a < n; a++) {
      ctx.fillStyle = colorOf(visIdx[a]);
      ctx.fillRect(rx, yAt(a), STRIP, yAt(a + 1) - yAt(a));
    }

    // labels — always shown
    ctx.fillStyle = '#4a4a46';
    ctx.font = `${font}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let a = 0; a < n; a++)
      ctx.fillText(S[visIdx[a]], hx0 - 5, yAt(a) + cellF / 2);
    ctx.textAlign = 'left';
    const by = yAt(n) + 5;
    for (let b = 0; b < n; b++) {
      ctx.save();
      ctx.translate(xAt(b) + cellF / 2, by);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(S[visIdx[b]], 0, 0);
      ctx.restore();
    }
  }, [layout, data]);

  // overlay: hover crosshair + pinned outline
  useEffect(() => {
    const cv = overRef.current;
    if (!cv || !layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, hx0, hy0, xAt, yAt, gridW, gridH, n, posOf } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (hover) {
      ctx.fillStyle = 'rgba(14,124,123,0.13)';
      if (hover.region !== 'top' && hover.a >= 0 && hover.a < n)
        ctx.fillRect(hx0, yAt(hover.a), gridW, yAt(hover.a + 1) - yAt(hover.a));
      if (hover.region !== 'right' && hover.b >= 0 && hover.b < n)
        ctx.fillRect(xAt(hover.b), hy0, xAt(hover.b + 1) - xAt(hover.b), gridH);
    }
    if (cell) {
      const a = posOf.get(cell.ra);
      const b = posOf.get(cell.rb);
      if (a !== undefined && b !== undefined) {
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(xAt(b) + 0.5, yAt(a) + 0.5, xAt(b + 1) - xAt(b) - 1, yAt(a + 1) - yAt(a) - 1);
        ctx.strokeRect(xAt(a) + 0.5, yAt(b) + 0.5, xAt(a + 1) - xAt(a) - 1, yAt(b + 1) - yAt(b) - 1);
      }
    }
  }, [hover, cell, layout]);

  if (error) return <p className="lk-error">Couldn't load linkage data ({error}).</p>;
  if (!manifest) return <p className="lk-loading">Loading…</p>;

  const S = data?.subtypes ?? [];
  const focusLineage = (entity: string) => {
    if (!data) return;
    const lin = data.lineages[entity];
    setSel((cur) => (cur === lin ? null : lin));
  };
  const onMove = (e: React.MouseEvent) => {
    if (!layout) return;
    const cv = overRef.current!;
    const rect = cv.getBoundingClientRect();
    const scale = layout.cssW / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    const { hx0, hy0, cellF, xAt, yAt, n } = layout;
    const b = Math.floor((mx - hx0) / cellF);
    const a = Math.floor((my - hy0) / cellF);
    const inCols = b >= 0 && b < n;
    const inRows = a >= 0 && a < n;
    const inGridX = mx >= hx0 && mx < xAt(n);
    const inGridY = my >= hy0 && my < yAt(n);
    let h: Hover | null = null;
    if (my < STRIP && inCols) h = { region: 'top', a: -1, b, px: mx, py: my };
    else if (mx > xAt(n) + GAP - 1 && inRows)
      h = { region: 'right', a, b: -1, px: mx, py: my };
    else if (inGridX && inGridY && inCols && inRows)
      h = { region: 'heat', a, b, px: mx, py: my };
    setHover(h);
  };
  const onClick = () => {
    if (!hover || !layout) return;
    if (hover.region === 'top') focusLineage(S[layout.visIdx[hover.b]]);
    else if (hover.region === 'right') focusLineage(S[layout.visIdx[hover.a]]);
    else if (hover.region === 'heat' && hover.a !== hover.b)
      setCell({ ra: layout.visIdx[hover.a], rb: layout.visIdx[hover.b] });
  };

  let tip: { html: string; x: number; y: number } | null = null;
  if (hover && layout && data) {
    const rb = layout.visIdx[hover.b];
    const ra = layout.visIdx[hover.a];
    let html = '';
    if (hover.region === 'top' || hover.region === 'right') {
      const s = S[hover.region === 'top' ? rb : ra];
      html = `${s}<span>${data.lineages[s]}</span><i>click to isolate lineage</i>`;
    } else if (hover.a !== hover.b) {
      const v = data.value[ra][rb];
      html = `${S[ra]} × ${S[rb]}<b>${v == null ? '—' : v.toFixed(3)}</b><i>click for stats</i>`;
    }
    if (html) tip = { html, x: hover.px, y: hover.py };
  }

  const sidebar = cell && data
    ? {
        rowSubtype: S[cell.ra],
        colSubtype: S[cell.rb],
        rowLineage: data.lineages[S[cell.ra]],
        colLineage: data.lineages[S[cell.rb]],
        rowColor: data.palette[data.lineages[S[cell.ra]]] ?? '#ccc',
        colColor: data.palette[data.lineages[S[cell.rb]]] ?? '#ccc',
        value: data.value[cell.ra][cell.rb],
        variance: data.varr[cell.ra][cell.rb],
        pValue: data.pval[cell.ra][cell.rb],
        rowN: data.nOf[S[cell.ra]],
        colN: data.nOf[S[cell.rb]],
      }
    : null;

  return (
    <div className="lk">
      <div className="lk__toolbar">
        <label className="lk__field">
          <span>Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {manifest.stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="lk__field">
          <span>Resolution</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {manifest.levels.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </label>
        {sel && (
          <div className="lk__focus">
            <span className="lk__focus-lab">Lineage:</span>
            <button className="lk__chip-btn" style={{ color: data?.palette[sel] }}>
              {sel}
            </button>
            <button className="lk__reset" onClick={() => setSel(null)}>Clear</button>
          </div>
        )}
      </div>

      <div className={`lk__body${cell ? ' has-sidebar' : ''}`}>
        <div className="lk__area" ref={areaRef}>
          {!data && <p className="lk-loading">Loading heatmap…</p>}
          {data && !layout && <p className="lk-loading">No entities to show.</p>}
          {data && layout && (
            <>
              <div className="lk__stage">
                <div className="lk__canvas-wrap">
                  <canvas ref={mainRef} className="lk__canvas" />
                  <canvas
                    ref={overRef}
                    className="lk__canvas lk__overlay"
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                    onClick={onClick}
                  />
                  {tip && (
                    <div
                      className="lk__tip"
                      style={{
                        left: `${(tip.x / layout.cssW) * 100}%`,
                        top: `${(tip.y / layout.cssH) * 100}%`,
                        // flip below near the top edge; anchor to a side near L/R edges
                        transform: `translate(${
                          tip.x < 90 ? '0%' : tip.x > layout.cssW - 90 ? '-100%' : '-50%'
                        }, ${tip.y < 54 ? '14px' : 'calc(-100% - 10px)'})`,
                      }}
                      dangerouslySetInnerHTML={{ __html: tip.html }}
                    />
                  )}
                </div>
              </div>

              <div className="lk__key">
                <span className="lk__key-lab">{data.scale.vmin}</span>
                <span
                  className="lk__ramp"
                  style={{ background: `linear-gradient(90deg, ${RDBU_R.join(',')})` }}
                />
                <span className="lk__key-lab">{data.scale.vmax}</span>
                <span className="lk__key-title">{data.scale.label}</span>
              </div>

              <div className="lk__legend" role="list">
                {data.lineageOrder.map((l) => (
                  <button
                    key={l}
                    role="listitem"
                    className={`lk__legend-item${l === sel ? ' is-current' : ''}`}
                    onClick={() => setSel((cur) => (cur === l ? null : l))}
                  >
                    <span className="lk__swatch" style={{ background: data.palette[l] }} />
                    {l}
                  </button>
                ))}
              </div>

              <p className="lk__hint">
                Ancestral linkage between {level === 'type' ? 'cell types' : 'cell subtypes'}
                {' '}(red = high, blue = low). Click a cell for its p-value and
                variance; click a lineage strip or legend entry to isolate that
                lineage.
              </p>
            </>
          )}
        </div>

        {sidebar && (
          <LinkageSidebar
            {...sidebar}
            valueLabel={data!.scale.label}
            cellColor={
              sidebar.value == null || !layout
                ? '#ccc'
                : (layout.colVal(sidebar.value) as string)
            }
            onClose={() => setCell(null)}
          />
        )}
      </div>
    </div>
  );
}
