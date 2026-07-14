# Data files

The interactive **Linkage** and **Fate** pages load JSON from this folder at
runtime. The files here are **placeholders** with realistic mock values so the
UI works end-to-end. Replace them with real exports in the same schema — no code
changes are needed as long as the schema matches.

TypeScript definitions live in `src/lib/data.ts`.

---

## `linkage.json` → Linkage heatmap

```jsonc
{
  "title": "…",
  "axes": {
    "rows": ["Epiblast", "…"],   // row cell types (top→bottom)
    "cols": ["Epiblast", "…"]    // column cell types (left→right)
  },
  "matrix": [[1.0, 0.42, …], …], // matrix[i][j] = value for rows[i] × cols[j]
  "meta": {                      // per-cell detail shown in the sidebar
    "Epiblast|Neural plate": {   // key is "<rowLabel>|<colLabel>"
      "value": 0.42,
      "nCells": 1234,
      "description": "…",
      "stat": { "pValue": 1e-3 },
      "sharedClones": 57
    }
  },
  "scale": { "label": "Linkage score", "min": 0, "max": 1 }
}
```

- `matrix` dimensions must be `rows.length × cols.length`.
- Every `matrix` cell should have a matching `meta["row|col"]` entry (missing
  entries render as "No data for this pair").
- Colors map `scale.min…scale.max` onto the teal ramp.
- Heatmaps larger than ~150×150 will need a canvas renderer (see the plan);
  the current SVG grid targets moderate matrices.

## `fate.json` → Fate Sankey (time-resolved lineage restriction)

**Generated** from two CSVs by `scripts/build_fate.mjs` — do not hand-edit:

- `fate_restriction.csv` — columns `source_time, target_time, source, target, count`
  (a flow of `count` cells from category `source` at `source_time` to `target`
  at `target_time`; timepoints are consecutive).
- `cell_types.csv` — provides the `lineage → germ_layer` hierarchy.

The category hierarchy is **Uncommitted → germ_layer → lineage**. Colors are set
by the `PALETTE` object at the top of `scripts/build_fate.mjs` — paste the
paper's `germ_layer_palette` / `lineage_palette` there to match exactly.

Regenerate after updating either CSV:

```bash
node scripts/build_fate.mjs
```

Emitted schema (consumed by `FateSankey.tsx`):

```jsonc
{
  "title": "…",
  "timePrefix": "E",          // axis label prefix, e.g. E4.5
  "timeLabel": "Embryonic day",
  "valueLabel": "fraction of cells",
  "times": [4.5, 5.0, …],     // ordered timepoints (columns)
  "order": ["Uncommitted", "Ectoderm", …],   // vertical stacking order
  "categories": {
    "Paraxial mesoderm": { "level": "lineage", "parent": "Mesoderm", "color": "#b5403c" }
  },
  "flows": [
    { "st": 4.5, "tt": 5.0, "s": "Uncommitted", "t": "Paraxial mesoderm", "count": 3 }
  ]
}
```

Interaction: the front-end keeps raw `count`s, then per view filters `flows` to
the selected branch (a category's ancestors ∪ itself ∪ descendants) and
normalizes per source timepoint, so clicking a node "expands" that branch to
fill the plot while the timepoints stay fixed.

---

## Regenerating placeholders

- `fate.json` — real data; rebuild with `node scripts/build_fate.mjs`.
- `linkage.json` — still placeholder; regenerate with
  `node scripts/gen_data.mjs public/data` (note: this script also overwrites
  `fate.json` with mock data, so re-run `build_fate.mjs` afterwards).
