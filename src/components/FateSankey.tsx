import { useEffect, useMemo, useRef, useState } from 'react';
import { dataUrl, type FateData } from '../lib/data';
import './fate.css';

// Geometry ported from devmap.plots.plot_restriction_sankey (normalize=True).
const W = 940;
const H = 540;
const PAD = { top: 30, right: 24, bottom: 16, left: 24 };
const GAP = 0.02; // gap between category bars (normalized y units)
const NODE_WIDTH = 0.1; // bar width in x units (time spacing = 1)
const CURVE = 0.45; // bezier control offset in x units
const RIBBON_ALPHA = 0.45;

interface Tip {
  x: number;
  y: number;
  html: string;
}

const key = (cat: string, time: number) => `${cat}@@${time}`;

export default function FateSankey() {
  const [data, setData] = useState<FateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null); // restrict focus
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(dataUrl('fate.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  // hierarchy helpers
  const relatives = useMemo(() => {
    if (!data) return null;
    const cats = data.categories;
    const ancestorsOf = (c: string): string[] => {
      const chain: string[] = [];
      let cur: string | null = c;
      while (cur) {
        chain.unshift(cur);
        cur = cats[cur]?.parent ?? null;
      }
      return chain;
    };
    const childrenOf = new Map<string, string[]>();
    for (const [name, meta] of Object.entries(cats)) {
      if (meta.parent) {
        if (!childrenOf.has(meta.parent)) childrenOf.set(meta.parent, []);
        childrenOf.get(meta.parent)!.push(name);
      }
    }
    const descendantsOf = (c: string): string[] => {
      const out: string[] = [];
      const q = [c];
      while (q.length) {
        const cur = q.shift()!;
        for (const ch of childrenOf.get(cur) ?? []) {
          out.push(ch);
          q.push(ch);
        }
      }
      return out;
    };
    return { ancestorsOf, descendantsOf };
  }, [data]);

  const layout = useMemo(() => {
    if (!data || !relatives) return null;

    // visible categories: all, or the selected branch (ancestors ∪ self ∪ descendants)
    const visible = new Set<string>();
    if (!sel) Object.keys(data.categories).forEach((c) => visible.add(c));
    else {
      relatives.ancestorsOf(sel).forEach((c) => visible.add(c));
      relatives.descendantsOf(sel).forEach((c) => visible.add(c));
    }

    let links = data.flows.filter(
      (f) => f.count > 0 && visible.has(f.s) && visible.has(f.t)
    );
    if (links.length === 0) return null;

    const times = [
      ...new Set(links.flatMap((f) => [f.st, f.tt])),
    ].sort((a, b) => a - b);
    const timeRank = new Map(times.map((t, i) => [t, i]));

    const present = new Set<string>();
    links.forEach((f) => {
      present.add(f.s);
      present.add(f.t);
    });
    // category order (bottom -> top), from data.order, then any extras
    const categories = data.order.filter((c) => present.has(c));
    for (const c of present) if (!categories.includes(c)) categories.push(c);
    const catRank = new Map(categories.map((c, i) => [c, i]));

    // stable stacking order (matches the Python sort)
    links = [...links].sort(
      (a, b) =>
        timeRank.get(a.st)! - timeRank.get(b.st)! ||
        catRank.get(a.s)! - catRank.get(b.s)! ||
        timeRank.get(a.tt)! - timeRank.get(b.tt)! ||
        catRank.get(a.t)! - catRank.get(b.t)!
    );

    // raw outgoing / incoming sums per (time, category)
    const outgoing = new Map<string, number>();
    const incoming = new Map<string, number>();
    for (const f of links) {
      outgoing.set(key(f.s, f.st), (outgoing.get(key(f.s, f.st)) ?? 0) + f.count);
      incoming.set(key(f.t, f.tt), (incoming.get(key(f.t, f.tt)) ?? 0) + f.count);
    }

    // node_counts: outgoing at intermediate times, incoming at the final time
    const nodeCount = new Map<string, number>();
    for (const t of times) {
      for (const c of categories) {
        const k = key(c, t);
        nodeCount.set(k, outgoing.get(k) ?? incoming.get(k) ?? 0);
      }
    }
    // normalize each timepoint to sum 1
    for (const t of times) {
      let total = 0;
      for (const c of categories) total += nodeCount.get(key(c, t))!;
      if (total > 0)
        for (const c of categories)
          nodeCount.set(key(c, t), nodeCount.get(key(c, t))! / total);
    }

    // stack bars bottom -> top per timepoint
    const pos = new Map<string, [number, number]>(); // [y0, y1] in data units (y up)
    let maxTop = 0;
    for (const t of times) {
      let y = 0;
      for (const c of categories) {
        const size = nodeCount.get(key(c, t))!;
        pos.set(key(c, t), [y, y + size]);
        if (size > 0) y += size + GAP;
      }
      maxTop = Math.max(maxTop, y);
    }
    if (maxTop <= 0) return null;

    // per-node scale so ribbons fill each bar exactly at each end
    const srcScale = new Map<string, number>();
    const tgtScale = new Map<string, number>();
    for (const [k, [y0, y1]] of pos) {
      const barH = y1 - y0;
      const out = outgoing.get(k) ?? 0;
      const inc = incoming.get(k) ?? 0;
      srcScale.set(k, out > 0 ? barH / out : 1);
      tgtScale.set(k, inc > 0 ? barH / inc : 1);
    }

    // pixel mappers (flip y: larger data-y -> higher on screen)
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xUnit = times.length > 1 ? innerW / (times.length - 1) : innerW;
    const xPix = (i: number) => PAD.left + i * xUnit;
    const yScale = innerH / maxTop;
    const yPix = (yData: number) => PAD.top + (maxTop - yData) * yScale;
    const halfW = (NODE_WIDTH / 2) * xUnit;
    const dxPix = CURVE * xUnit;

    // raw outgoing total per timepoint (for tooltip fractions)
    const colOut = new Map<number, number>();
    for (const f of links) colOut.set(f.st, (colOut.get(f.st) ?? 0) + f.count);

    // build ribbons (single pass in sorted order, accumulating both offsets)
    const srcOff = new Map<string, number>();
    const tgtOff = new Map<string, number>();
    for (const [k, [y0]] of pos) {
      srcOff.set(k, y0);
      tgtOff.set(k, y0);
    }
    const ribbons = links.map((f) => {
      const sk = key(f.s, f.st);
      const tk = key(f.t, f.tt);
      const sw = f.count * srcScale.get(sk)!;
      const y0a = srcOff.get(sk)!;
      const y0b = y0a + sw;
      srcOff.set(sk, y0b);
      const tw = f.count * tgtScale.get(tk)!;
      const y1a = tgtOff.get(tk)!;
      const y1b = y1a + tw;
      tgtOff.set(tk, y1b);

      const x0 = xPix(timeRank.get(f.st)!);
      const x1 = xPix(timeRank.get(f.tt)!);
      const p = [
        `M${x0},${yPix(y0a)}`,
        `C${x0 + dxPix},${yPix(y0a)} ${x1 - dxPix},${yPix(y1a)} ${x1},${yPix(y1a)}`,
        `L${x1},${yPix(y1b)}`,
        `C${x1 - dxPix},${yPix(y1b)} ${x0 + dxPix},${yPix(y0b)} ${x0},${yPix(y0b)}`,
        'Z',
      ].join(' ');
      return {
        path: p,
        color: data.categories[f.s]?.color ?? '#999',
        s: f.s,
        t: f.t,
        st: f.st,
        tt: f.tt,
        count: f.count,
        srcFrac: f.count / (colOut.get(f.st) || 1),
      };
    });

    // build bars
    const bars = [] as {
      cat: string;
      time: number;
      x: number;
      w: number;
      y: number;
      h: number;
      color: string;
      frac: number;
    }[];
    for (const t of times) {
      for (const c of categories) {
        const [y0, y1] = pos.get(key(c, t))!;
        if (y1 <= y0) continue;
        bars.push({
          cat: c,
          time: t,
          x: xPix(timeRank.get(t)!) - halfW,
          w: halfW * 2,
          y: yPix(y1),
          h: (y1 - y0) * yScale,
          color: data.categories[c]?.color ?? '#999',
          frac: nodeCount.get(key(c, t))!,
        });
      }
    }

    const timeX = times.map((t) => ({ t, x: xPix(timeRank.get(t)!) }));
    const legend = categories; // bottom->top
    return { ribbons, bars, timeX, legend };
  }, [data, relatives, sel]);

  if (error) return <p className="fs-error">Couldn't load fate data ({error}).</p>;
  if (!data) return <p className="fs-loading">Loading Sankey…</p>;
  if (!layout) return <p className="fs-loading">No flows to show.</p>;

  const { ribbons, bars, timeX, legend } = layout;
  const fmtTime = (t: number) => `${data.timePrefix}${t}`;
  const crumbs = sel && relatives ? relatives.ancestorsOf(sel) : [];

  const showTip = (e: React.MouseEvent, html: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, html });
  };
  const focus = (cat: string) => setSel(cat === 'Uncommitted' ? null : cat);

  return (
    <div className="fs" ref={wrapRef}>
      <div className="fs__controls">
        <nav className="fs__crumbs" aria-label="Restriction focus">
          <button
            className={`fs__crumb${!sel ? ' is-current' : ''}`}
            onClick={() => setSel(null)}
          >
            All lineages
          </button>
          {crumbs.map((c) => (
            <span key={c}>
              <span className="fs__sep" aria-hidden="true">
                ›
              </span>
              <button
                className={`fs__crumb${c === sel ? ' is-current' : ''}`}
                onClick={() => focus(c)}
                style={{ color: c === sel ? undefined : data.categories[c]?.color }}
              >
                {c}
              </button>
            </span>
          ))}
        </nav>
        {sel && (
          <button className="fs__reset" onClick={() => setSel(null)}>
            Reset view
          </button>
        )}
      </div>

      <div className="fs__scroll">
        <svg
          className="fs__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={data.title}
        >
          <g key={sel ?? 'all'} className="fs__scene">
            {/* time axis */}
            {timeX.map(({ t, x }) => (
              <text key={t} className="fs__stage" x={x} y={16} textAnchor="middle">
                {fmtTime(t)}
              </text>
            ))}

            {/* ribbons (drawn under bars), colored by source */}
            <g className="fs__ribbons">
              {ribbons.map((r, i) => (
                <path
                  key={i}
                  d={r.path}
                  fill={r.color}
                  fillOpacity={RIBBON_ALPHA}
                  className="fs__ribbon"
                  onMouseMove={(e) =>
                    showTip(
                      e,
                      `${r.s} → ${r.t}<span>${fmtTime(r.st)} → ${fmtTime(
                        r.tt
                      )}</span><b>${(r.srcFrac * 100).toFixed(
                        1
                      )}% · ${r.count.toLocaleString()} cells</b>`
                    )
                  }
                  onMouseLeave={() => setTip(null)}
                />
              ))}
            </g>

            {/* node bars (on top) */}
            <g className="fs__bars">
              {bars.map((b) => {
                const clickable = b.cat !== 'Uncommitted';
                return (
                  <rect
                    key={key(b.cat, b.time)}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill={b.color}
                    stroke="#1a1a1a"
                    strokeWidth={0.5}
                    className={clickable ? 'is-clickable' : ''}
                    onClick={() => clickable && focus(b.cat)}
                    onMouseMove={(e) =>
                      showTip(
                        e,
                        `${b.cat}<span>${fmtTime(b.time)}</span><b>${(
                          b.frac * 100
                        ).toFixed(1)}% of cells</b>${
                          clickable ? '<i>click to restrict</i>' : ''
                        }`
                      )
                    }
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* clickable legend (bottom -> top order) */}
      <div className="fs__legend" role="list">
        {legend.map((c) => (
          <button
            key={c}
            role="listitem"
            className={`fs__legend-item${c === sel ? ' is-current' : ''}`}
            onClick={() => focus(c)}
            disabled={c === 'Uncommitted'}
          >
            <span
              className="fs__swatch"
              style={{ background: data.categories[c]?.color }}
            />
            {c}
          </button>
        ))}
      </div>

      {tip && (
        <div
          className="fs__tip"
          style={{ left: tip.x, top: tip.y }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      )}

      <p className="fs__hint">
        Bar height is the fraction of cells in each commitment state at that
        timepoint; ribbons fill each bar exactly at both ends. Click a germ layer
        or lineage to restrict the view to that branch and its ancestors.
      </p>
    </div>
  );
}
