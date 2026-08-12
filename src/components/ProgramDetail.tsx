import { useState } from 'react';
import { withBase } from '../lib/base';
import type { ProgramEntry } from '../lib/data';

const umapSrc = (file: string) => encodeURI(withBase(`/img/programs/${file}`));

function downloadGenes(program: ProgramEntry) {
  const blob = new Blob([program.genes.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${program.id}_genes.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProgramDetail({ program }: { program: ProgramEntry | null }) {
  const [showGenes, setShowGenes] = useState(false);

  if (!program) {
    return (
      <p className="gp-placeholder">
        Select a gene program in the heatmap — or the dropdown above it — to
        see its UMAP, description, and member genes.
      </p>
    );
  }

  return (
    <div className="gp-detail">
      <div className="gp-detail__head">
        <span className="gp-swatch" style={{ background: program.color }} />
        <div>
          <h3 className="gp-detail__title">{program.name}</h3>
          <p className="gp-detail__id">{program.id} · {program.size} genes</p>
        </div>
      </div>

      {program.umap && (
        <figure className="gp-umap">
          <img
            src={umapSrc(program.umap)}
            alt={`UMAP highlighting ${program.name} expression`}
            loading="lazy"
            decoding="async"
          />
        </figure>
      )}

      <p className="gp-desc">{program.description}</p>

      {program.activeIn.length > 0 && (
        <div className="gp-section">
          <span className="gp-section__lab">Active in</span>
          <div className="gp-tags">
            {program.activeIn.map((c) => (
              <span key={c} className="gp-tag gp-tag--active">{c}</span>
            ))}
          </div>
        </div>
      )}

      <div className="gp-section">
        <div className="gp-section__row">
          <button
            className="gp-genes-toggle"
            onClick={() => setShowGenes((v) => !v)}
            aria-expanded={showGenes}
          >
            <span className="gp-genes-toggle__arrow">{showGenes ? '▾' : '▸'}</span>
            Genes ({program.genes.length})
          </button>
          <button className="gp-genes-download" onClick={() => downloadGenes(program)}>
            Download .txt
          </button>
        </div>
        {showGenes && (
          <div className="gp-tags">
            {program.genes.map((g) => (
              <span key={g} className="gp-tag">{g}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
