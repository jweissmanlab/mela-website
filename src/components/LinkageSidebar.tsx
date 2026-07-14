import type { LinkageMeta } from '../lib/data';

interface Props {
  row: string;
  col: string;
  meta: LinkageMeta | undefined;
  scaleLabel: string;
  color: string;
  onClose: () => void;
}

export default function LinkageSidebar({
  row,
  col,
  meta,
  scaleLabel,
  color,
  onClose,
}: Props) {
  return (
    <aside className="lk-sidebar" role="dialog" aria-label={`${row} × ${col} detail`}>
      <button className="lk-sidebar__close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <span className="lk-sidebar__eyebrow" style={{ color }}>
        Cell-type pair
      </span>
      <h3 className="lk-sidebar__title">
        {row} <span aria-hidden="true">×</span> {col}
      </h3>

      {meta ? (
        <>
          <div className="lk-sidebar__value" style={{ borderColor: color }}>
            <span className="lk-sidebar__value-num" style={{ color }}>
              {meta.value.toFixed(3)}
            </span>
            <span className="lk-sidebar__value-lab">{scaleLabel}</span>
          </div>

          <p className="lk-sidebar__desc">{meta.description}</p>

          <dl className="lk-sidebar__stats">
            <div>
              <dt>Cells</dt>
              <dd>{meta.nCells.toLocaleString()}</dd>
            </div>
            {meta.sharedClones !== undefined && (
              <div>
                <dt>Shared clones</dt>
                <dd>{meta.sharedClones.toLocaleString()}</dd>
              </div>
            )}
            {meta.stat?.pValue !== undefined && (
              <div>
                <dt>p-value</dt>
                <dd>{meta.stat.pValue}</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="lk-sidebar__desc">No data for this pair.</p>
      )}
    </aside>
  );
}
