import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';
import { dataUrl, type CellTypeData, type CTNode, type CTDetail } from '../lib/data';
import { withBase } from '../lib/base';
import './celltypes.css';

const SEP = ''; // path separator (names alone collide: germ vs. lineage)
const umapSrc = (file: string) => encodeURI(withBase(`/img/umaps/${file}`));
const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmt2 = (n: number) => n.toFixed(2);

// same RdBu_r scale (±1.5, center 0) as the Linkage heatmap
const RDBU_R = [
  '#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7',
  '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f',
];
const linkColor = scaleLinear<string>()
  .domain(RDBU_R.map((_, k) => -1.5 + (3 * k) / (RDBU_R.length - 1)))
  .range(RDBU_R)
  .clamp(true);

type ShowTip = (content: ReactNode, e: React.MouseEvent) => void;

interface TreeProps {
  node: CTNode;
  nodeKey: string;
  depth: number;
  isOpen: (key: string) => boolean;
  isShown: (key: string) => boolean;
  toggle: (key: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({ node, nodeKey, depth, isOpen, isShown, toggle, selected, onSelect }: TreeProps) {
  const hasChildren = node.children.length > 0;
  const open = isOpen(nodeKey);
  const selectable = node.level === 'cell_type' || node.level === 'cell_subtype';
  const kids = hasChildren
    ? node.children
        .map((c) => ({ c, key: nodeKey + SEP + c.name }))
        .filter(({ key }) => isShown(key))
    : [];
  return (
    <li className="ct-li">
      <div
        className={`ct-row${selected === node.id ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
      >
        {hasChildren ? (
          <button
            className="ct-tw"
            onClick={() => toggle(nodeKey)}
            aria-label={open ? 'Collapse' : 'Expand'}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="ct-tw ct-tw--spacer" />
        )}
        <span className="ct-swatch" style={{ background: node.color }} />
        {selectable ? (
          <button className="ct-label ct-label--btn" onClick={() => onSelect(node.id!)}>
            {node.name}
          </button>
        ) : (
          <button
            className="ct-label ct-label--group"
            onClick={() => hasChildren && toggle(nodeKey)}
          >
            {node.name}
          </button>
        )}
      </div>
      {hasChildren && open && kids.length > 0 && (
        <ul className="ct-ul">
          {kids.map(({ c, key }) => (
            <TreeNode
              key={key}
              node={c}
              nodeKey={key}
              depth={depth + 1}
              isOpen={isOpen}
              isShown={isShown}
              toggle={toggle}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  reps,
  fmt,
  showTip,
  hideTip,
}: {
  label: string;
  value: number;
  reps: { embryo: string; value: number }[];
  fmt: (n: number) => string;
  showTip: ShowTip;
  hideTip: () => void;
}) {
  const tip = (
    <div className="ct-tip__reps">
      {reps.map((r) => (
        <span key={r.embryo}>
          <b>{r.embryo}</b> {fmt(r.value)}
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="ct-stat"
      onMouseMove={(e) => showTip(tip, e)}
      onMouseLeave={hideTip}
    >
      <div className="ct-stat__val">{fmt(value)}</div>
      <div className="ct-stat__lab">{label}</div>
    </div>
  );
}

function Detail({ d, showTip, hideTip }: { d: CTDetail; showTip: ShowTip; hideTip: () => void }) {
  return (
    <div className="ct-detail__inner">
      <div className="ct-detail__grid">
        {d.umap && (
          <figure className="ct-umap">
            <img src={umapSrc(d.umap)} alt={`UMAP highlighting ${d.name}`} loading="lazy" decoding="async" />
          </figure>
        )}
        <div className="ct-detail__body">
          {d.description && <p className="ct-desc">{d.description}</p>}

          {(d.globalMarkers.length > 0 || d.localMarkers.length > 0 || d.stages.length > 0) && (
            <div className="ct-markers">
              {d.globalMarkers.length > 0 && (
                <div className="ct-markers__group">
                  <span className="ct-markers__lab">Global markers</span>
                  <div className="ct-genes">
                    {d.globalMarkers.map((g) => (
                      <span key={g} className="ct-gene">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {d.localMarkers.length > 0 && (
                <div className="ct-markers__group">
                  <span className="ct-markers__lab">Local markers</span>
                  <div className="ct-genes">
                    {d.localMarkers.map((g) => (
                      <span key={g} className="ct-gene ct-gene--local">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              {d.stages.length > 0 && (
                <div className="ct-markers__group">
                  <span className="ct-markers__lab">Stages</span>
                  <div className="ct-genes">
                    {d.stages.map((s) => (
                      <span key={s} className="ct-gene ct-gene--stage">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {d.clade && (
        <div className="ct-section">
          <h4 className="ct-section__h">E9.5 fate-restricted clade statistics</h4>
          <div className="ct-stats">
            <Stat label="Mean clade count" value={d.clade.nClades.mean} reps={d.clade.nClades.reps} fmt={fmtInt} showTip={showTip} hideTip={hideTip} />
            <Stat label="Mean inferred time" value={d.clade.depth.mean} reps={d.clade.depth.reps} fmt={fmt2} showTip={showTip} hideTip={hideTip} />
            <Stat label="Mean clade size" value={d.clade.size.mean} reps={d.clade.size.reps} fmt={fmt2} showTip={showTip} hideTip={hideTip} />
          </div>
          <p className="ct-hint">Hover a value for the three E9.5 replicates.</p>
        </div>
      )}

      {d.topLinks.length > 0 && (
        <div className="ct-section">
          <h4 className="ct-section__h">Top ancestral linkage at E9.5</h4>
          <ul className="ct-links">
            {d.topLinks.map((l) => (
              <li key={l.partner} className="ct-link">
                <span className="ct-link__name">{l.partner}</span>
                <span
                  className="ct-link__swatch"
                  style={{ background: l.normValue != null ? (linkColor(l.normValue) as string) : '#eee' }}
                />
                <span className="ct-link__val">{l.normValue?.toFixed(2) ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CellTypeExplorer() {
  const [data, setData] = useState<CellTypeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tip, setTip] = useState<{ node: ReactNode; x: number; y: number } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(dataUrl('celltypes.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CellTypeData) => {
        setData(d);
        setExpanded(new Set([d.tree.name])); // fully collapsed: only the root open
      })
      .catch((e) => setError(String(e)));
  }, []);

  // descendant path-keys per node (for collapse-on-expand)
  const descByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (n: CTNode, key: string): string[] => {
      const acc: string[] = [];
      for (const c of n.children) {
        const ck = key + SEP + c.name;
        acc.push(ck, ...walk(c, ck));
      }
      map.set(key, acc);
      return acc;
    };
    if (data) walk(data.tree, data.tree.name);
    return map;
  }, [data]);

  // search: which path-keys to show / force-open along match paths
  const { shown, forceOpen } = useMemo(() => {
    const shown = new Set<string>();
    const forceOpen = new Set<string>();
    const q = query.trim().toLowerCase();
    if (!q || !data) return { shown, forceOpen };
    const walk = (n: CTNode, key: string): boolean => {
      let childMatch = false;
      for (const c of n.children) if (walk(c, key + SEP + c.name)) childMatch = true;
      const self = n.name.toLowerCase().includes(q);
      if (self || childMatch) {
        shown.add(key);
        if (childMatch) forceOpen.add(key);
      }
      return self || childMatch;
    };
    walk(data.tree, data.tree.name);
    return { shown, forceOpen };
  }, [data, query]);

  const searching = query.trim().length > 0;
  const isOpen = (key: string) => (searching ? forceOpen.has(key) : expanded.has(key));
  const isShown = (key: string) => !searching || shown.has(key);

  // expanding a node collapses its subcategories (drill one level at a time)
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        for (const d of descByKey.get(key) ?? []) next.delete(d);
      }
      return next;
    });

  const onSelect = (id: string) => setSelected(id);
  const showTip: ShowTip = (node, e) => setTip({ node, x: e.clientX, y: e.clientY });
  const hideTip = () => setTip(null);

  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  const detail = useMemo(
    () => (data && selected ? data.details[selected] : null),
    [data, selected]
  );

  if (error) return <p className="ct-error">Couldn't load cell type data ({error}).</p>;
  if (!data) return <p className="ct-loading">Loading…</p>;

  return (
    <div className="ct">
      <div className="ct-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cell types and subtypes…"
          aria-label="Search cell types"
        />
      </div>

      <div className="ct-tree card">
        {searching && shown.size === 0 ? (
          <p className="ct-empty">No matches for “{query.trim()}”.</p>
        ) : (
          <ul className="ct-ul ct-ul--root">
            <TreeNode
              node={data.tree}
              nodeKey={data.tree.name}
              depth={0}
              isOpen={isOpen}
              isShown={isShown}
              toggle={toggle}
              selected={selected}
              onSelect={onSelect}
            />
          </ul>
        )}
      </div>

      <div className="ct-detail" ref={detailRef}>
        {detail ? (
          <>
            <div className="ct-detail__head">
              <span className="ct-swatch ct-swatch--lg" style={{ background: detailColor(data, detail) }} />
              <div>
                <h3 className="ct-detail__title">{detail.name}</h3>
                <p className="ct-detail__level">
                  {detail.level === 'type' ? 'Cell type' : 'Cell subtype'}
                </p>
              </div>
            </div>
            <Detail d={detail} showTip={showTip} hideTip={hideTip} />
          </>
        ) : (
          <p className="ct-placeholder">
            Select a cell type or subtype in the tree above to see its UMAP,
            markers, description, clade statistics, and top ancestral linkages.
          </p>
        )}
      </div>

      {tip && (
        <div className="ct-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.node}
        </div>
      )}
    </div>
  );
}

function detailColor(data: CellTypeData, d: CTDetail): string {
  let found = '#9aa0a6';
  const walk = (n: CTNode) => {
    if (n.id === d.id) found = n.color;
    else n.children.forEach(walk);
  };
  walk(data.tree);
  return found;
}
