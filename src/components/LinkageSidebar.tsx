interface Props {
  rowSubtype: string;
  colSubtype: string;
  rowLineage: string;
  colLineage: string;
  rowColor: string;
  colColor: string;
  value: number | null;
  variance: number;
  pValue: number;
  rowN?: number;
  colN?: number;
  valueLabel: string;
  cellColor: string;
  onClose: () => void;
}

const fmtP = (p: number) => (p === 0 ? '< 1e-2' : p.toExponential(2));

export default function LinkageSidebar({
  rowSubtype,
  colSubtype,
  rowLineage,
  colLineage,
  rowColor,
  colColor,
  value,
  variance,
  pValue,
  rowN,
  colN,
  valueLabel,
  cellColor,
  onClose,
}: Props) {
  return (
    <aside className="lk-sidebar" role="dialog" aria-label={`${rowSubtype} × ${colSubtype} detail`}>
      <button className="lk-sidebar__close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <span className="lk-sidebar__eyebrow">Subtype pair</span>
      <h3 className="lk-sidebar__title">
        <span className="lk-sidebar__st">
          <span className="lk-sidebar__chip" style={{ background: rowColor }} />
          {rowSubtype}
        </span>
        <span className="lk-sidebar__times" aria-hidden="true">×</span>
        <span className="lk-sidebar__st">
          <span className="lk-sidebar__chip" style={{ background: colColor }} />
          {colSubtype}
        </span>
      </h3>

      <div className="lk-sidebar__value" style={{ borderColor: cellColor }}>
        <span className="lk-sidebar__value-num">
          {value == null ? '—' : value.toFixed(3)}
        </span>
        <span className="lk-sidebar__value-lab">{valueLabel}</span>
      </div>

      <dl className="lk-sidebar__stats">
        <div>
          <dt>p-value</dt>
          <dd>{fmtP(pValue)}</dd>
        </div>
        <div>
          <dt>Variance</dt>
          <dd>{variance.toFixed(4)}</dd>
        </div>
        <div>
          <dt>{rowLineage === colLineage ? 'Lineage' : 'Lineages'}</dt>
          <dd>{rowLineage === colLineage ? rowLineage : `${rowLineage} / ${colLineage}`}</dd>
        </div>
        {rowN !== undefined && colN !== undefined && (
          <div>
            <dt>Cells (row / col)</dt>
            <dd>{rowN.toLocaleString()} / {colN.toLocaleString()}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
