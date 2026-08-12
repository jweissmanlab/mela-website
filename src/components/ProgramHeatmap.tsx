import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import type { ProgramEntry, ProgramManifest } from '../lib/data';

// same RdBu_r ramp as the Linkage heatmap / Cell types page
const RDBU_R = [
  '#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7',
  '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f',
];

const STRIP = 12; // program-color strip thickness (css px)
const GAP = 3;
const MIN_CELL = 3;
const LABEL_CAP = 172;
const OVERVIEW_MAX = 720; // square overview canvas cap (css px)
const LUT_LIM = 2000; // raw (x1000) value range covered by the color LUT

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// accepts both "#rrggbb" (palette colors) and "rgb(r, g, b)" (d3's
// scaleLinear<string> color interpolation output, e.g. from colVal())
function colorToRgb(color: string): [number, number, number] {
  if (color[0] === '#') {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/[\d.]+/g)!;
  return [+m[0], +m[1], +m[2]];
}

interface Props {
  manifest: ProgramManifest;
  matrix: Int16Array;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function ProgramHeatmap({ manifest, matrix, selected, onSelect }: Props) {
  const { n: N, scale } = manifest;

  const geneToProgIdx = useMemo(() => {
    const arr = new Int32Array(N);
    manifest.programs.forEach((p, pi) => {
      for (let i = p.start; i < p.end; i++) arr[i] = pi;
    });
    return arr;
  }, [manifest, N]);

  const colVal = useMemo(
    () =>
      scaleLinear<string>()
        .domain(RDBU_R.map((_, k) => scale.vmin + ((scale.vmax - scale.vmin) * k) / (RDBU_R.length - 1)))
        .range(RDBU_R)
        .clamp(true),
    [scale]
  );

  const lut = useMemo(() => {
    const out = new Uint8ClampedArray((2 * LUT_LIM + 1) * 3);
    for (let raw = -LUT_LIM; raw <= LUT_LIM; raw++) {
      const [r, g, b] = colorToRgb(colVal(raw / scale.factor) as string);
      const o = (raw + LUT_LIM) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
    return out;
  }, [colVal, scale.factor]);

  const program = selected ? manifest.programs.find((p) => p.id === selected) ?? null : null;

  return (
    <div className="gp-heat">
      <div className="gp-heat__toolbar">
        <label className="gp-heat__field">
          <span>Program</span>
          <select
            value={selected ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
          >
            <option value="">Overview (all {manifest.programs.length})</option>
            {manifest.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} — {p.name}
              </option>
            ))}
          </select>
        </label>
        {program && (
          <div className="gp-heat__focus">
            <span className="gp-heat__chip" style={{ background: program.color }} />
            <span className="gp-heat__focus-lab">{program.id} · {program.size} genes</span>
            <button className="gp-heat__reset" onClick={() => onSelect(null)}>
              Zoom out
            </button>
          </div>
        )}
      </div>

      {program ? (
        <ZoomCanvas manifest={manifest} matrix={matrix} program={program} colVal={colVal} />
      ) : (
        <OverviewCanvas
          manifest={manifest}
          matrix={matrix}
          geneToProgIdx={geneToProgIdx}
          lut={lut}
          onSelect={onSelect}
        />
      )}

      <div className="gp-heat__key">
        <span className="gp-heat__key-lab">{scale.vmin}</span>
        <span
          className="gp-heat__ramp"
          style={{ background: `linear-gradient(90deg, ${RDBU_R.join(',')})` }}
        />
        <span className="gp-heat__key-lab">{scale.vmax}</span>
        <span className="gp-heat__key-title">{scale.label}</span>
      </div>

      <p className="gp-heat__hint">
        {program ? (
          <>
            Local correlation among the {program.size} genes in {program.id} (red = high,
            blue = low). Hover a cell for the gene pair and value.
          </>
        ) : (
          <>
            Each pixel is the local correlation between a pair of genes, ordered by gene
            program (red = high, blue = low). Colored strips mark each gene's program —
            click a strip, or choose a program above, to zoom in and see gene names.
          </>
        )}
      </p>
    </div>
  );
}

// ── overview: full gene x gene matrix rendered as a scaled bitmap ──
interface OverviewHover {
  region: 'heat' | 'top' | 'right';
  a: number;
  b: number;
  px: number;
  py: number;
}

function OverviewCanvas({
  manifest,
  matrix,
  geneToProgIdx,
  lut,
  onSelect,
}: {
  manifest: ProgramManifest;
  matrix: Int16Array;
  geneToProgIdx: Int32Array;
  lut: Uint8ClampedArray;
  onSelect: (id: string | null) => void;
}) {
  const N = manifest.n;
  const [availW, setAvailW] = useState(720);
  const [hover, setHover] = useState<OverviewHover | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const bmpRef = useRef<HTMLCanvasElement | null>(null);
  const topStripRef = useRef<HTMLCanvasElement | null>(null);
  const rightStripRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // build the N x N bitmap + program-color strips once per matrix/palette
  useEffect(() => {
    const bmp = document.createElement('canvas');
    bmp.width = N;
    bmp.height = N;
    const bctx = bmp.getContext('2d')!;
    const img = bctx.createImageData(N, N);
    const data = img.data;
    for (let a = 0; a < N; a++) {
      const rowOff = a * N;
      for (let b = 0; b < N; b++) {
        const raw = clamp(matrix[rowOff + b], -LUT_LIM, LUT_LIM);
        const lo = (raw + LUT_LIM) * 3;
        const po = (rowOff + b) * 4;
        data[po] = lut[lo];
        data[po + 1] = lut[lo + 1];
        data[po + 2] = lut[lo + 2];
        data[po + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    bmpRef.current = bmp;

    const colorOf = (i: number) => manifest.programs[geneToProgIdx[i]]?.color ?? '#ccc';
    const top = document.createElement('canvas');
    top.width = N;
    top.height = 1;
    const tctx = top.getContext('2d')!;
    const timg = tctx.createImageData(N, 1);
    const right = document.createElement('canvas');
    right.width = 1;
    right.height = N;
    const rctx = right.getContext('2d')!;
    const rimg = rctx.createImageData(1, N);
    for (let i = 0; i < N; i++) {
      const [r, g, b] = colorToRgb(colorOf(i));
      const to = i * 4;
      timg.data[to] = r; timg.data[to + 1] = g; timg.data[to + 2] = b; timg.data[to + 3] = 255;
      rimg.data[to] = r; rimg.data[to + 1] = g; rimg.data[to + 2] = b; rimg.data[to + 3] = 255;
    }
    tctx.putImageData(timg, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    topStripRef.current = top;
    rightStripRef.current = right;
  }, [manifest, matrix, lut, geneToProgIdx, N]);

  const layout = useMemo(() => {
    const size = clamp(availW, 280, OVERVIEW_MAX);
    const hx0 = 30;
    const hy0 = STRIP + GAP;
    const grid = size - hx0 - GAP - STRIP;
    const cellF = grid / N;
    const xAt = (k: number) => hx0 + k * cellF;
    const yAt = (k: number) => hy0 + k * cellF;
    const cssW = hx0 + grid + GAP + STRIP;
    const cssH = hy0 + grid + 24;

    // sparse program tick labels — keep only those with enough pixel spacing
    const MIN_SPACING = 15;
    const centers = manifest.programs.map((p) => (p.start + p.end) / 2);
    const keep: number[] = [];
    let last = -Infinity;
    centers.forEach((c, pi) => {
      const pos = c * cellF;
      if (pos - last >= MIN_SPACING) {
        keep.push(pi);
        last = pos;
      }
    });

    return { size, hx0, hy0, grid, cellF, xAt, yAt, cssW, cssH, keep };
  }, [availW, manifest, N]);

  useEffect(() => {
    const cv = mainRef.current;
    const bmp = bmpRef.current;
    const top = topStripRef.current;
    const right = rightStripRef.current;
    if (!cv || !bmp || !top || !right) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, hx0, hy0, grid, xAt, yAt } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(bmp, 0, 0, N, N, hx0, hy0, grid, grid);
    ctx.drawImage(top, 0, 0, N, 1, hx0, 0, grid, STRIP);
    ctx.drawImage(right, 0, 0, 1, N, hx0 + grid + GAP, hy0, STRIP, grid);

    ctx.fillStyle = '#4a4a46';
    ctx.font = '9px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const pi of layout.keep) {
      const p = manifest.programs[pi];
      ctx.fillText(p.id, hx0 - 4, yAt((p.start + p.end) / 2));
    }
    ctx.textAlign = 'left';
    for (const pi of layout.keep) {
      const p = manifest.programs[pi];
      ctx.save();
      ctx.translate(xAt((p.start + p.end) / 2), hy0 + grid + 5);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(p.id, 0, 0);
      ctx.restore();
    }
  }, [layout, manifest, N]);

  useEffect(() => {
    const cv = overRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, hx0, hy0, grid, xAt, yAt } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (hover) {
      ctx.fillStyle = 'rgba(14,124,123,0.13)';
      if (hover.region !== 'top') ctx.fillRect(hx0, yAt(hover.a), grid, yAt(hover.a + 1) - yAt(hover.a));
      if (hover.region !== 'right') ctx.fillRect(xAt(hover.b), hy0, xAt(hover.b + 1) - xAt(hover.b), grid);
    }
  }, [hover, layout]);

  const onMove = (e: React.MouseEvent) => {
    const cv = overRef.current!;
    const rect = cv.getBoundingClientRect();
    const scale = layout.cssW / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    const { hx0, hy0, grid, cellF } = layout;
    const b = clamp(Math.floor((mx - hx0) / cellF), 0, N - 1);
    const a = clamp(Math.floor((my - hy0) / cellF), 0, N - 1);
    let h: OverviewHover | null = null;
    if (my < STRIP && mx >= hx0 && mx < hx0 + grid) h = { region: 'top', a: -1, b, px: mx, py: my };
    else if (mx > hx0 + grid + GAP - 1 && mx < hx0 + grid + GAP + STRIP && my >= hy0 && my < hy0 + grid)
      h = { region: 'right', a, b: -1, px: mx, py: my };
    else if (mx >= hx0 && mx < hx0 + grid && my >= hy0 && my < hy0 + grid)
      h = { region: 'heat', a, b, px: mx, py: my };
    setHover(h);
  };
  const onClick = () => {
    if (!hover) return;
    const geneIdx = hover.region === 'top' ? hover.b : hover.a;
    const program = manifest.programs[geneToProgIdx[geneIdx]];
    if (program) onSelect(program.id);
  };

  let tip: { html: string; x: number; y: number } | null = null;
  if (hover) {
    const genes = manifest.geneOrder;
    if (hover.region === 'heat') {
      const raw = matrix[hover.a * N + hover.b];
      const pa = manifest.programs[geneToProgIdx[hover.a]];
      const pb = manifest.programs[geneToProgIdx[hover.b]];
      tip = {
        html: `${genes[hover.a]} × ${genes[hover.b]}<b>${(raw / manifest.scale.factor).toFixed(3)}</b><span>${pa.id}${pa.id !== pb.id ? ` / ${pb.id}` : ''}</span>`,
        x: hover.px,
        y: hover.py,
      };
    } else {
      const gi = hover.region === 'top' ? hover.b : hover.a;
      const p = manifest.programs[geneToProgIdx[gi]];
      tip = {
        html: `${genes[gi]}<span>${p.id} · ${p.name}</span><i>click to zoom into ${p.id}</i>`,
        x: hover.px,
        y: hover.py,
      };
    }
  }

  return (
    <div className="gp-heat__area" ref={areaRef}>
      <div className="gp-heat__canvas-wrap">
        <canvas ref={mainRef} className="gp-heat__canvas" />
        <canvas
          ref={overRef}
          className="gp-heat__canvas gp-heat__overlay"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
        />
        {tip && (
          <div
            className="gp-heat__tip"
            style={{
              left: `${(tip.x / layout.cssW) * 100}%`,
              top: `${(tip.y / layout.cssH) * 100}%`,
              transform: `translate(${
                tip.x < 90 ? '0%' : tip.x > layout.cssW - 90 ? '-100%' : '-50%'
              }, ${tip.y < 54 ? '14px' : 'calc(-100% - 10px)'})`,
            }}
            dangerouslySetInnerHTML={{ __html: tip.html }}
          />
        )}
      </div>
    </div>
  );
}

// ── zoomed: one program's gene x gene block, with gene name labels ──
interface ZoomHover {
  a: number;
  b: number;
  px: number;
  py: number;
}

function ZoomCanvas({
  manifest,
  matrix,
  program,
  colVal,
}: {
  manifest: ProgramManifest;
  matrix: Int16Array;
  program: ProgramEntry;
  colVal: (v: number) => string;
}) {
  const N = manifest.n;
  const genes = program.genes;
  const n = genes.length;
  const [availW, setAvailW] = useState(720);
  const [hover, setHover] = useState<ZoomHover | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);
  if (!measureRef.current && typeof document !== 'undefined')
    measureRef.current = document.createElement('canvas').getContext('2d');

  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const mc = measureRef.current;
    const labelPx = (font: number) => {
      if (!mc) return 90;
      mc.font = `${font}px Inter, sans-serif`;
      let m = 0;
      for (const g of genes) m = Math.max(m, mc.measureText(g).width);
      return m;
    };
    const avail = Math.max(280, availW);
    const cell0 = Math.max(MIN_CELL, (avail - 90) / n);
    let font = clamp(Math.floor(cell0) - 1, 3, 11);
    let leftW = Math.min(LABEL_CAP, labelPx(font) + 8);
    const usable = avail - leftW - 1;
    const cellF = Math.max(MIN_CELL, usable / n);
    font = clamp(Math.floor(cellF) - 1, 3, 11);
    leftW = Math.min(LABEL_CAP, labelPx(font) + 8);
    const bottomH = Math.min(LABEL_CAP, labelPx(font) + 8);

    const hx0 = leftW;
    const hy0 = 4;
    const xAt = (k: number) => Math.round(hx0 + k * cellF);
    const yAt = (k: number) => Math.round(hy0 + k * cellF);
    const grid = xAt(n) - hx0;
    const cssW = xAt(n);
    const cssH = yAt(n) + bottomH;
    return { hx0, hy0, cellF, font, xAt, yAt, grid, cssW, cssH };
  }, [availW, genes, n]);

  useEffect(() => {
    const cv = mainRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, xAt, yAt, cellF, font } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    for (let a = 0; a < n; a++) {
      const rowOff = (program.start + a) * N;
      const y = yAt(a);
      const h = yAt(a + 1) - y;
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const raw = matrix[rowOff + program.start + b];
        ctx.fillStyle = colVal(raw / manifest.scale.factor);
        ctx.fillRect(xAt(b), y, xAt(b + 1) - xAt(b), h);
      }
    }

    ctx.fillStyle = '#4a4a46';
    ctx.font = `${font}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let a = 0; a < n; a++) ctx.fillText(genes[a], layout.hx0 - 5, yAt(a) + cellF / 2);
    ctx.textAlign = 'left';
    const by = yAt(n) + 5;
    for (let b = 0; b < n; b++) {
      ctx.save();
      ctx.translate(xAt(b) + cellF / 2, by);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(genes[b], 0, 0);
      ctx.restore();
    }
  }, [layout, program, matrix, manifest, genes, n, N, colVal]);

  useEffect(() => {
    const cv = overRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cssW, cssH, hx0, hy0, xAt, yAt, grid } = layout;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = `${cssW}px`;
    cv.style.height = `${cssH}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (hover) {
      ctx.fillStyle = 'rgba(14,124,123,0.13)';
      ctx.fillRect(hx0, yAt(hover.a), grid, yAt(hover.a + 1) - yAt(hover.a));
      ctx.fillRect(xAt(hover.b), hy0, xAt(hover.b + 1) - xAt(hover.b), grid);
    }
  }, [hover, layout]);

  const onMove = (e: React.MouseEvent) => {
    const cv = overRef.current!;
    const rect = cv.getBoundingClientRect();
    const scale = layout.cssW / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    const { hx0, hy0, cellF, xAt, yAt } = layout;
    const b = Math.floor((mx - hx0) / cellF);
    const a = Math.floor((my - hy0) / cellF);
    if (b >= 0 && b < n && a >= 0 && a < n && mx >= hx0 && mx < xAt(n) && my >= hy0 && my < yAt(n))
      setHover({ a, b, px: mx, py: my });
    else setHover(null);
  };

  let tip: { html: string; x: number; y: number } | null = null;
  if (hover && hover.a !== hover.b) {
    const raw = matrix[(program.start + hover.a) * N + program.start + hover.b];
    tip = {
      html: `${genes[hover.a]} × ${genes[hover.b]}<b>${(raw / manifest.scale.factor).toFixed(3)}</b>`,
      x: hover.px,
      y: hover.py,
    };
  }

  return (
    <div className="gp-heat__area" ref={areaRef}>
      <div className="gp-heat__canvas-wrap">
        <canvas ref={mainRef} className="gp-heat__canvas" />
        <canvas
          ref={overRef}
          className="gp-heat__canvas gp-heat__overlay"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
        {tip && (
          <div
            className="gp-heat__tip"
            style={{
              left: `${(tip.x / layout.cssW) * 100}%`,
              top: `${(tip.y / layout.cssH) * 100}%`,
              transform: `translate(${
                tip.x < 90 ? '0%' : tip.x > layout.cssW - 90 ? '-100%' : '-50%'
              }, ${tip.y < 54 ? '14px' : 'calc(-100% - 10px)'})`,
            }}
            dangerouslySetInnerHTML={{ __html: tip.html }}
          />
        )}
      </div>
    </div>
  );
}
