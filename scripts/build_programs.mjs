// Build public/data/programs.json + public/data/programs_corr.bin for the
// Gene Programs page.
//
// Inputs (data/gene_programs/):
//   annotated_programs.csv   program,genes,size,active_in,name,description
//   local_correlations.csv   gene x gene local-correlation matrix (2228 genes)
// UMAP images live in public/img/programs/{program}_umap.png
//
// The correlation matrix is restricted to the ~1300 genes that belong to a
// program (matching the analysis this page mirrors) and reordered so each
// program's genes are contiguous — this lets the heatmap zoom into a single
// program's block without any re-indexing on the client. Values are
// quantized to Int16 (x1000) and shipped as a flat row-major binary blob
// instead of JSON: at ~1300x1300 genes a nested JSON array would be tens of
// MB and slow to parse, where the binary is a couple MB and loads as a
// typed array with zero parsing.
//
// Also copies annotated_programs.csv as-is into public/downloads/ so the
// Download page can link to it directly (small, human-readable table —
// unlike the correlation matrix, no need to transform it).
//
// Usage: node scripts/build_programs.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = join(HERE, '..', 'data', 'gene_programs');
const OUT = join(HERE, '..', 'public', 'data');
const DOWNLOADS = join(HERE, '..', 'public', 'downloads');
const UMAPS = join(HERE, '..', 'public', 'img', 'programs');

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
const splitList = (s) => (s ? s.split(',').map((g) => g.trim()).filter(Boolean) : []);

// "godsnot_102" categorical palette — 102 maximally distinct colors; cycled
// per program (70 programs, well within 102).
const GODSNOT_102 = [
  '#FFFF00', '#1CE6FF', '#FF34FF', '#FF4A46', '#008941', '#006FA6', '#A30059',
  '#FFDBE5', '#7A4900', '#0000A6', '#63FFAC', '#B79762', '#004D43', '#8FB0FF',
  '#997D87', '#5A0007', '#809693', '#6A3A4C', '#1B4400', '#4FC601', '#3B5DFF',
  '#4A3B53', '#FF2F80', '#61615A', '#BA0900', '#6B7900', '#00C2A0', '#FFAA92',
  '#FF90C9', '#B903AA', '#D16100', '#DDEFFF', '#000035', '#7B4F4B', '#A1C299',
  '#300018', '#0AA6D8', '#013349', '#00846F', '#372101', '#FFB500', '#C2FFED',
  '#A079BF', '#CC0744', '#C0B9B2', '#C2FF99', '#001E09', '#00489C', '#6F0062',
  '#0CBD66', '#EEC3FF', '#456D75', '#B77B68', '#7A87A1', '#788D66', '#885578',
  '#FAD09F', '#FF8A9A', '#D157A0', '#BEC459', '#456648', '#0086ED', '#886F4C',
  '#34362D', '#B4A8BD', '#00A6AA', '#452C2C', '#636375', '#A3C8C9', '#FF913F',
  '#938A81', '#575329', '#00FECF', '#B05B6F', '#8CD0FF', '#3B9700', '#04F757',
  '#C8A1A1', '#1E6E00', '#7900D7', '#A77500', '#6367A9', '#A05837', '#6B002C',
  '#772600', '#D790FF', '#9B9700', '#549E79', '#FFF69F', '#201625', '#72418F',
  '#BC23FF', '#99ADC0', '#3A2465', '#922329', '#5B4534', '#FDE8DC', '#404E55',
  '#0089A3', '#CB7E98', '#A4E804', '#324E72',
];

const programRows = parseCsv(readFileSync(join(IN, 'annotated_programs.csv'), 'utf8'));

// ---- gene order: concatenate each program's genes, in program order ----
const geneOrder = [];
const programs = [];
programRows.forEach((r, i) => {
  const genes = splitList(r.genes);
  const start = geneOrder.length;
  geneOrder.push(...genes);
  const umapFile = `${r.program}_umap.png`;
  programs.push({
    id: r.program,
    name: r.name,
    description: r.description,
    size: +r.size,
    activeIn: splitList(r.active_in),
    genes,
    start,
    end: start + genes.length,
    umap: existsSync(join(UMAPS, umapFile)) ? umapFile : null,
    color: GODSNOT_102[i % GODSNOT_102.length],
  });
});
const N = geneOrder.length;

// ---- restrict + reorder the full gene x gene matrix to geneOrder ----
const corrText = readFileSync(join(IN, 'local_correlations.csv'), 'utf8');
const lines = corrText.split(/\r?\n/).filter(Boolean);
const header = lines[0].split(',').slice(1); // gene names, full matrix order
const fullIdx = new Map(header.map((g, i) => [g, i]));

const rowOf = new Map(); // gene -> Float64Array of that gene's full row
for (let i = 1; i < lines.length; i++) {
  const cells = lines[i].split(',');
  const gene = cells[0];
  if (!fullIdx.has(gene)) continue; // only need rows for genes we keep
  const vals = new Float64Array(cells.length - 1);
  for (let j = 1; j < cells.length; j++) vals[j - 1] = parseFloat(cells[j]);
  rowOf.set(gene, vals);
}

const missing = geneOrder.filter((g) => !rowOf.has(g));
if (missing.length) {
  throw new Error(`${missing.length} program genes missing from correlation matrix: ${missing.slice(0, 10).join(', ')}`);
}

const SCALE = 1000;
const matrix = new Int16Array(N * N);
for (let a = 0; a < N; a++) {
  const rowVals = rowOf.get(geneOrder[a]);
  for (let b = 0; b < N; b++) {
    const fb = fullIdx.get(geneOrder[b]);
    matrix[a * N + b] = Math.round(rowVals[fb] * SCALE);
  }
}

writeFileSync(join(OUT, 'programs_corr.bin'), Buffer.from(matrix.buffer));

const manifest = {
  n: N,
  geneOrder,
  programs,
  scale: { factor: SCALE, vmin: -0.5, vmax: 0.5, label: 'Local correlation' },
};
writeFileSync(join(OUT, 'programs.json'), JSON.stringify(manifest));

copyFileSync(join(IN, 'annotated_programs.csv'), join(DOWNLOADS, 'annotated_programs.csv'));

console.log(`programs.json: ${programs.length} programs, ${N} genes`);
console.log(`programs_corr.bin: ${N}x${N} Int16 (${(matrix.byteLength / 1e6).toFixed(1)} MB)`);
console.log('downloads/annotated_programs.csv: copied');
