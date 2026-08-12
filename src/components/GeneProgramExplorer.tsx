import { useEffect, useState } from 'react';
import { dataUrl, fetchInt16, type ProgramManifest } from '../lib/data';
import ProgramHeatmap from './ProgramHeatmap';
import ProgramDetail from './ProgramDetail';
import './programs.css';

export default function GeneProgramExplorer() {
  const [manifest, setManifest] = useState<ProgramManifest | null>(null);
  const [matrix, setMatrix] = useState<Int16Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(dataUrl('programs.json')).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ProgramManifest>;
      }),
      fetchInt16('programs_corr.bin'),
    ])
      .then(([m, mat]) => {
        setManifest(m);
        setMatrix(mat);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p className="gp-error">Couldn't load gene program data ({error}).</p>;
  if (!manifest || !matrix) return <p className="gp-loading">Loading…</p>;

  const program = selected ? manifest.programs.find((p) => p.id === selected) ?? null : null;

  return (
    <div className="gp">
      <div className="gp__body">
        <div className="gp__heat card">
          <ProgramHeatmap
            manifest={manifest}
            matrix={matrix}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="gp__detail card">
          <ProgramDetail key={program?.id ?? 'none'} program={program} />
        </div>
      </div>
    </div>
  );
}
