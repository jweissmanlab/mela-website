import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { dataUrl, type LinkageData } from '../lib/data';
import LinkageSidebar from './LinkageSidebar';
import './linkage.css';

// sequential ramp (matches --ramp-* tokens)
const RAMP = ['#f6f4ef', '#bfe0dd', '#5fb2ad', '#0e7c7b', '#0a4f4d'];

export default function LinkageHeatmap() {
  const [data, setData] = useState<LinkageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const [sel, setSel] = useState<{ i: number; j: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(dataUrl('linkage.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const color = useMemo(() => {
    if (!data) return () => RAMP[0];
    const { min, max } = data.scale;
    return scaleLinear<string>()
      .domain(RAMP.map((_, k) => min + ((max - min) * k) / (RAMP.length - 1)))
      .range(RAMP)
      .clamp(true);
  }, [data]);

  // keyboard navigation over the grid
  useEffect(() => {
    if (!data) return;
    const n = data.axes.rows.length;
    const m = data.axes.cols.length;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSel(null);
        return;
      }
      const cur = sel ?? { i: 0, j: 0 };
      let { i, j } = cur;
      if (e.key === 'ArrowDown') i = Math.min(n - 1, i + 1);
      else if (e.key === 'ArrowUp') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowRight') j = Math.min(m - 1, j + 1);
      else if (e.key === 'ArrowLeft') j = Math.max(0, j - 1);
      else return;
      e.preventDefault();
      setSel({ i, j });
      setHover({ i, j });
    }
    const el = gridRef.current;
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [data, sel]);

  if (error)
    return (
      <p className="lk-error">Couldn't load linkage data ({error}).</p>
    );
  if (!data) return <p className="lk-loading">Loading heatmap…</p>;

  const { rows, cols } = data.axes;
  const selPair = sel ? { row: rows[sel.i], col: cols[sel.j] } : null;

  return (
    <div className="lk">
      <div className={`lk__main${sel ? ' has-sidebar' : ''}`}>
        <figure className="lk__figure">
          <div className="lk__scroll">
            <div
              className="lk__grid"
              ref={gridRef}
              tabIndex={0}
              role="grid"
              aria-label={data.title}
              style={{
                gridTemplateColumns: `var(--lk-label) repeat(${cols.length}, 1fr)`,
              }}
            >
              {/* top-left corner */}
              <div className="lk__corner" />
              {/* column headers */}
              {cols.map((c, j) => (
                <div
                  key={`col-${j}`}
                  className={`lk__col-label${hover?.j === j ? ' is-hi' : ''}`}
                >
                  <span>{c}</span>
                </div>
              ))}

              {/* rows */}
              {rows.map((rlabel, i) => (
                <div className="lk__row" key={`row-${i}`} role="row">
                  <div
                    className={`lk__row-label${hover?.i === i ? ' is-hi' : ''}`}
                  >
                    {rlabel}
                  </div>
                  {cols.map((_, j) => {
                    const v = data.matrix[i][j];
                    const isSel = sel?.i === i && sel?.j === j;
                    const isCross = hover?.i === i || hover?.j === j;
                    return (
                      <button
                        key={`c-${i}-${j}`}
                        role="gridcell"
                        aria-label={`${rlabel} × ${cols[j]}: ${v.toFixed(3)}`}
                        className={`lk__cell${isSel ? ' is-sel' : ''}${
                          isCross ? ' is-cross' : ''
                        }`}
                        style={{ background: color(v) as string }}
                        onMouseEnter={() => setHover({ i, j })}
                        onFocus={() => setHover({ i, j })}
                        onClick={() => setSel({ i, j })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <figcaption className="lk__legend">
            <span>{data.scale.min}</span>
            <span
              className="lk__ramp"
              style={{
                background: `linear-gradient(90deg, ${RAMP.join(',')})`,
              }}
            />
            <span>{data.scale.max}</span>
            <span className="lk__legend-label">{data.scale.label}</span>
          </figcaption>
        </figure>
      </div>

      {sel && selPair && (
        <LinkageSidebar
          row={selPair.row}
          col={selPair.col}
          meta={data.meta[`${selPair.row}|${selPair.col}`]}
          scaleLabel={data.scale.label}
          color={color(data.matrix[sel.i][sel.j]) as string}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}
