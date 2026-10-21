import React, { useState } from 'react';
import {
  X,
  ClipboardList,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileText
} from 'lucide-react';

interface ImportAiStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

interface ParsedModelRow {
  model_name: string;
  display_name: string;
  category: string;
  strict_limits: {
    rpm: number | string;
    tpm: number | string;
    rpd: number | string;
  };
  working_limits: {
    rpm: number | string;
    tpm: number | string;
    rpd: number | string;
  };
}

const SAMPLE_AI_STUDIO_TEXT = `Gemini 4 Argon	Text-out	1,000 RPM	2,000,000 TPM	Unlimited RPD
Gemini 3.8 Flash	Multi-modal	1,000 RPM	2,000,000 TPM	10,000 RPD
Gemini 3.5 Flash-Lite	Text-out	4,000 RPM	4,000,000 TPM	150,000 RPD
Gemini Omni Flash	Video/Audio	4 RPM	Unlimited TPM	20 RPD
Gemini Embedding 2	Embedding	3,000 RPM	1,000,000 TPM	Unlimited RPD`;

export const ImportAiStudioModal: React.FC<ImportAiStudioModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [targetTier, setTargetTier] = useState<'FREE' | 'PAID'>('FREE');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedModels, setParsedModels] = useState<ParsedModelRow[] | null>(null);
  const [importedTier, setImportedTier] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!rawText.trim()) {
      setError('Please paste copied text from aistudio.google.com/rate-limit');
      return;
    }

    setLoading(true);
    setError(null);
    setParsedModels(null);

    try {
      const res = await fetch('/api/governor/import-aistudio-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: rawText,
          target_tier: targetTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to parse AI Studio rate limits');
      }

      setParsedModels(data.models || []);
      setImportedTier(data.target_tier);
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while importing limits');
    } finally {
      setLoading(false);
    }
  };

  const handleInsertSample = () => {
    setRawText(SAMPLE_AI_STUDIO_TEXT);
    setError(null);
  };

  const formatLimit = (val: number | string) => {
    if (val === 'Unlimited' || val === 'unlimited') return '∞ Unlimited';
    if (typeof val === 'number') {
      return val >= 1000000
        ? `${(val / 1000000).toFixed(1)}M`
        : val >= 1000
        ? `${(val / 1000).toFixed(0)}K`
        : val.toString();
    }
    return String(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div
        id="import-aistudio-modal"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/40">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>1-Click Google AI Studio Limit Importer</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                  Dual Discovery
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Paste copied tables from{' '}
                <a
                  href="https://aistudio.google.com/rate-limit"
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-400 underline hover:text-purple-300"
                >
                  aistudio.google.com/rate-limit
                </a>
                . Normalizes K/M/Unlimited &amp; computes exact 85% safety limits.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Target Tier Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
            <div>
              <span className="text-slate-300 font-bold block">Target Quota Tier:</span>
              <span className="text-slate-500 text-[10px] font-sans">
                Select where to persist the imported rate limits in provider quotas
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTargetTier('FREE')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border transition-all ${
                  targetTier === 'FREE'
                    ? 'bg-blue-600/30 text-blue-300 border-blue-500 shadow-glow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Free Pool (Tier-0)</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetTier('PAID')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border transition-all ${
                  targetTier === 'PAID'
                    ? 'bg-amber-600/30 text-amber-300 border-amber-500 shadow-glow-amber'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Paid Tier-1 (Pay-as-you-go)</span>
              </button>
            </div>
          </div>

          {/* Paste Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <span>Raw AI Studio Table Text or HTML</span>
              </label>
              <button
                type="button"
                onClick={handleInsertSample}
                className="text-[11px] text-purple-400 hover:text-purple-300 underline font-sans"
              >
                Insert Sample Telemetry
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste table copied from https://aistudio.google.com/rate-limit here (tab-separated, pipe-separated, or HTML table)..."
              rows={6}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 text-[11px] font-mono leading-relaxed"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Success & Preview Table */}
          {parsedModels && parsedModels.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold">
                    Successfully parsed &amp; applied 85% limits for {parsedModels.length} models to GOOGLE {importedTier}!
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Model</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Strict (100%) Limits</th>
                      <th className="p-2.5 text-emerald-400">Working (85%) Limits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {parsedModels.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-2.5 font-bold text-white">
                          <div>{m.display_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{m.model_name}</div>
                        </td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700">
                            {m.category}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400">
                          {formatLimit(m.strict_limits.rpm)} RPM &bull; {formatLimit(m.strict_limits.tpm)} TPM &bull; {formatLimit(m.strict_limits.rpd)} RPD
                        </td>
                        <td className="p-2.5 text-emerald-300 font-semibold">
                          {formatLimit(m.working_limits.rpm)} RPM &bull; {formatLimit(m.working_limits.tpm)} TPM &bull; {formatLimit(m.working_limits.rpd)} RPD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {parsedModels ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading || !rawText.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50 shadow-glow-sm"
          >
            {loading ? (
              <span>Parsing Limits...</span>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                <span>Parse &amp; Apply 85% Limits</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
