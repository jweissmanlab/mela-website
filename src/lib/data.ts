import { withBase } from './base';

export const dataUrl = (name: string) => withBase(`/data/${name}`);

// ---- Linkage ----
export interface LinkageMeta {
  value: number;
  nCells: number;
  description: string;
  stat?: { pValue?: number };
  sharedClones?: number;
}
export interface LinkageData {
  title: string;
  axes: { rows: string[]; cols: string[] };
  matrix: number[][];
  meta: Record<string, LinkageMeta>;
  scale: { label: string; min: number; max: number };
}

// ---- Fate (time-resolved restriction Sankey) ----
export interface FateCategory {
  level: 'root' | 'germ_layer' | 'lineage';
  parent: string | null;
  color: string;
}
export interface FateFlow {
  st: number; // source timepoint
  tt: number; // target timepoint
  s: string; // source category
  t: string; // target category
  count: number;
}
export interface FateData {
  title: string;
  timePrefix: string;
  timeLabel: string;
  valueLabel: string;
  times: number[];
  order: string[]; // vertical stacking order (top -> bottom)
  categories: Record<string, FateCategory>;
  flows: FateFlow[];
}
