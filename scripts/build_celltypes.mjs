// Build public/data/celltypes.json for the Cell Types page.
//
// Hierarchy (Uncommitted -> germ_layer -> lineage -> cell_type -> cell_subtype)
// plus per-entity detail (umap, markers, description, E9.5 clade stats, top-5
// ancestral linkage). Cell types/subtypes with the same name collapse to the
// cell type only.
//
// Inputs (data/):
//   cell_types.csv                    hierarchy + colors
//   cell_types_annotated.csv          markers + description (level, name)
//   e95_cell_type_clade_stats.csv     per replicate: n_progenitors, mean_time, mean_size
//   e95_type_linkage_annotated.csv    top5_for, norm_value, novelty, proposed_explanation
// UMAP images live in public/img/umaps/{name}_cell_{type,subtype}_umap.png
//
// Usage: node scripts/build_celltypes.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = join(HERE, '..', 'data');
const OUT = join(HERE, '..', 'public', 'data');
const UMAPS = join(HERE, '..', 'public', 'img', 'umaps');

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? '').trim()));
    return o;
  });
}

const GERM_PALETTE = {
  Ectoderm: '#1874CD', Mesoderm: '#CD2626', Endoderm: '#FFE600',
  Epiblast: '#A983F2', 'Primordial germ cell': '#20C4AC',
};
const LINEAGE_PALETTE = {
  Epiblast: '#A983F2', 'Primordial germ cell': '#20C4AC', Ectoderm: '#1874CD',
  'Neural ectoderm': '#83A4FF', 'Surface ectoderm': '#75F6FC', 'Neural crest': '#7C0EDD',
  'Extraembryonic ectoderm': '#262C6B', Mesoderm: '#CD2626',
  'Lateral plate mesoderm': '#7F0303', 'Intermediate mesoderm': '#FFC0CB',
  'Paraxial mesoderm': '#FF7D7D', 'Extraembryonic mesoderm': '#D34818',
  Endoderm: '#FFE600', 'Extraembryonic endoderm': '#E69F00', Blood: '#009E73',
};
const GERM_ORDER = ['Ectoderm', 'Mesoderm', 'Endoderm', 'Epiblast', 'Primordial germ cell'];

const cells = parseCsv(readFileSync(join(IN, 'cell_types.csv'), 'utf8'));
const annot = parseCsv(readFileSync(join(IN, 'cell_types_annotated.csv'), 'utf8'));
const clade = parseCsv(readFileSync(join(IN, 'e95_cell_type_clade_stats.csv'), 'utf8'));
const linkage = parseCsv(readFileSync(join(IN, 'e95_type_linkage_annotated.csv'), 'utf8'));

const umap = (name, level) => {
  const file = `${name}_cell_${level === 'subtype' ? 'subtype' : 'type'}_umap.png`;
  return existsSync(join(UMAPS, file)) ? file : null;
};
const splitGenes = (s) => (s ? s.split(',').map((g) => g.trim()).filter(Boolean) : []);

// ---- annotation lookup (by level + name) ----
const annById = {};
for (const r of annot) {
  const key = r.level === 'cell subtype' ? `subtype:${r.cell_subtype}` : `type:${r.cell_type}`;
  annById[key] = {
    globalMarkers: splitGenes(r.global_markers),
    localMarkers: splitGenes(r.local_markers),
    stages: splitGenes(r.stages),
    description: r.description || '',
  };
}

// ---- E9.5 clade stats per cell type (fate), aggregated across replicates ----
const cladeByType = {};
for (const r of clade) {
  const fate = r.fate;
  (cladeByType[fate] ??= []).push({
    embryo: r.embryo,
    nClades: +r.n_progenitors,
    depth: +r.mean_time,
    size: +r.mean_size,
  });
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function cladeStats(name) {
  const reps = cladeByType[name];
  if (!reps || !reps.length) return null;
  const stat = (key) => ({
    mean: mean(reps.map((r) => r[key])),
    reps: reps.map((r) => ({ embryo: r.embryo, value: r[key] })),
  });
  return { nClades: stat('nClades'), depth: stat('depth'), size: stat('size') };
}

// ---- top-5 ancestral linkage per cell type (from top5_for) ----
const topByType = {};
for (const r of linkage) {
  if (!r.top5_for) continue;
  const nv = parseFloat(r.norm_value);
  for (const who of r.top5_for.split(';').map((s) => s.trim()).filter(Boolean)) {
    const partner = r.source === who ? r.target : r.source;
    if (partner === who) continue;
    (topByType[who] ??= []).push({
      partner,
      normValue: Number.isFinite(nv) ? +nv.toFixed(3) : null,
      novelty: r.novelty ? +r.novelty : 0,
      explanation: r.proposed_explanation || '',
    });
  }
}
for (const k in topByType)
  topByType[k] = topByType[k].sort((a, b) => (b.normValue ?? 0) - (a.normValue ?? 0)).slice(0, 5);

// ---- build hierarchy + details ----
const details = {};
function detailFor(name, level) {
  const id = `${level}:${name}`;
  const a = annById[id] || { globalMarkers: [], localMarkers: [], stages: [], description: '' };
  const d = {
    id,
    name,
    level, // 'type' | 'subtype'
    umap: umap(name, level),
    globalMarkers: a.globalMarkers,
    localMarkers: a.localMarkers,
    stages: a.stages,
    description: a.description,
    clade: level === 'type' ? cladeStats(name) : null,
    topLinks: level === 'type' ? topByType[name] || [] : [],
  };
  details[id] = d;
  return id;
}

// group rows: germ_layer -> lineage -> cell_type -> [subtypes], capturing colors
const tree = { name: 'Uncommitted', level: 'root', color: '#CCCCCC', children: [] };
const germs = new Map();
for (const r of cells) {
  const { germ_layer, lineage, cell_type, cell_subtype, type_color, subtype_color } = r;
  if (!germ_layer || !lineage || !cell_type) continue;
  if (!germs.has(germ_layer)) germs.set(germ_layer, new Map());
  const lins = germs.get(germ_layer);
  if (!lins.has(lineage)) lins.set(lineage, new Map());
  const types = lins.get(lineage);
  if (!types.has(cell_type)) types.set(cell_type, { color: type_color, subs: new Map() });
  const t = types.get(cell_type);
  if (!t.color) t.color = type_color;
  if (cell_subtype && cell_subtype !== cell_type)
    t.subs.set(cell_subtype, subtype_color);
}

const sortByPalette = (arr, pal) =>
  arr.sort((a, b) => {
    const ia = Object.keys(pal).indexOf(a), ib = Object.keys(pal).indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });

for (const germ of sortByPalette([...germs.keys()], GERM_PALETTE)) {
  const germNode = {
    name: germ, level: 'germ_layer', color: GERM_PALETTE[germ] || '#9aa0a6', children: [],
  };
  const lins = germs.get(germ);
  for (const lin of sortByPalette([...lins.keys()], LINEAGE_PALETTE)) {
    const linNode = {
      name: lin, level: 'lineage', color: LINEAGE_PALETTE[lin] || '#9aa0a6', children: [],
    };
    const types = lins.get(lin);
    for (const type of [...types.keys()].sort((a, b) => a.localeCompare(b))) {
      const { color, subs } = types.get(type);
      const typeNode = {
        name: type, level: 'cell_type', color: color || '#9aa0a6',
        id: detailFor(type, 'type'), children: [],
      };
      for (const sub of [...subs.keys()].sort((a, b) => a.localeCompare(b))) {
        typeNode.children.push({
          name: sub, level: 'cell_subtype', color: subs.get(sub) || '#9aa0a6',
          id: detailFor(sub, 'subtype'), children: [],
        });
      }
      linNode.children.push(typeNode);
    }
    germNode.children.push(linNode);
  }
  tree.children.push(germNode);
}

writeFileSync(join(OUT, 'celltypes.json'), JSON.stringify({ tree, details }));
const nTypes = Object.values(details).filter((d) => d.level === 'type').length;
const nSubs = Object.values(details).filter((d) => d.level === 'subtype').length;
const noUmap = Object.values(details).filter((d) => !d.umap).length;
console.log(`celltypes.json: ${nTypes} cell types, ${nSubs} subtypes, ${noUmap} without a UMAP`);
