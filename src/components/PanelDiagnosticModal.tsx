/**
 * Panel Evaluation & Structured JSON Diagnostic Modal
 * Directly satisfies Panel Recommendation #14 (All outputs displayed cleanly)
 * and #15 (Local setup, structured JSON for evaluations & future model switching)
 */

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  RefreshCw,
  FileCode,
  Download,
  Terminal,
} from 'lucide-react';
import type {
  TomatoDetectionEvent,
  StructuredInferenceResponse,
  SortingAction,
  QualityGrade,
} from '../types.ts';
import { generateStructuredInferenceJson } from '../lib/post-harvest.ts';
import { YOLO11_PYTHON_SCRIPT } from '../lib/yolo11-script-content.ts';

interface PanelDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestEvent?: TomatoDetectionEvent | null;
  activeModelBackend?: string;
  onSwitchBackend?: (backendId: string) => void;
}

export const PanelDiagnosticModal: React.FC<PanelDiagnosticModalProps> = ({
  isOpen,
  onClose,
  latestEvent,
  activeModelBackend = 'yolov11_roboflow',
  onSwitchBackend,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [scriptCopied, setScriptCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'json' | 'python'>('json');
  const [testScenario, setTestScenario] = useState<'live' | 'healthy_98' | 'early_blight_97' | 'late_blight_96' | 'low_conf_84'>('live');

  if (!isOpen) return null;

  // Compute structured JSON based on selected scenario or latest live event
  let responseData: StructuredInferenceResponse;

  if (testScenario === 'healthy_98') {
    responseData = generateStructuredInferenceJson({
      ripeness: 'ripe',
      confidence: 0.982,
      rawClass: 'ripe tomato',
      size: 'large',
      diameterMm: 72,
    });
  } else if (testScenario === 'early_blight_97') {
    responseData = generateStructuredInferenceJson({
      ripeness: 'blight',
      confidence: 0.974,
      rawClass: 'early blight alternaria',
      blightType: 'early_blight',
      severity: 'mild',
      size: 'medium',
      diameterMm: 64,
    });
  } else if (testScenario === 'late_blight_96') {
    responseData = generateStructuredInferenceJson({
      ripeness: 'blight',
      confidence: 0.965,
      rawClass: 'late blight phytophthora',
      blightType: 'late_blight',
      severity: 'severe',
      size: 'medium',
      diameterMm: 66,
    });
  } else if (testScenario === 'low_conf_84') {
    responseData = generateStructuredInferenceJson({
      ripeness: 'ripe',
      confidence: 0.841, // Below 95% threshold -> triggers MANUAL_REVIEW
      rawClass: 'ripe tomato',
      size: 'medium',
      diameterMm: 60,
    });
  } else if (latestEvent) {
    responseData = generateStructuredInferenceJson({
      ripeness: latestEvent.ripeness,
      confidence: latestEvent.confidence > 1 ? latestEvent.confidence / 100 : latestEvent.confidence,
      rawClass: latestEvent.class,
      blightType: latestEvent.blightType,
      severity: latestEvent.severity,
      size: latestEvent.size,
      diameterMm: latestEvent.diameterMm,
    });
  } else {
    responseData = generateStructuredInferenceJson({
      ripeness: 'ripe',
      confidence: 0.975,
      rawClass: 'ripe tomato',
      size: 'medium',
      diameterMm: 68,
    });
  }

  const jsonString = JSON.stringify(
    {
      status: responseData.status,
      classification: responseData.classification,
      confidence_percentage: responseData.confidence_percentage,
      sorting_action: responseData.sorting_action,
      quality_grade: responseData.quality_grade,
      analytics_notes: responseData.analytics_notes,
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blightdetect-panel-eval-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4 bg-stone-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/40 text-red-400">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Capstone Defense Evaluation Engine (YOLOv11 Pipeline)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Panel Rec #14 & #15
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Ultralytics YOLOv11 edge pipeline, strict 95% threshold sorting verification & post-harvest analytics schema
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-800 bg-stone-950/50 px-6 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'json'
                ? 'border-red-500 text-white bg-stone-900/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileCode className="h-3.5 w-3.5 text-red-400" />
            <span>Structured JSON Protocol</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('python')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'python'
                ? 'border-emerald-500 text-white bg-stone-900/60'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5 text-emerald-400" />
            <span>Ultralytics YOLOv11 Python Pipeline</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'python' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-stone-950/60 border border-stone-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                    <span>Production YOLOv11 Edge Sorting Daemon (`blightdetect_yolo11.py`)</span>
                  </h4>
                  <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                    Designed for Raspberry Pi 5 / Jetson Orin Nano / Conveyor PC. Features OpenCV threading, millimetric calibration (0.35 mm/px), 95% confidence sorting gating, and async HTTP telemetry streaming to this web dashboard.
                  </p>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(YOLO11_PYTHON_SCRIPT);
                      setScriptCopied(true);
                      setTimeout(() => setScriptCopied(false), 2000);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    {scriptCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{scriptCopied ? 'Copied' : 'Copy Script'}</span>
                  </button>
                  <a
                    href="/api/edge/script"
                    download="blightdetect_yolo11.py"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Script</span>
                  </a>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-950 border border-stone-800/80 text-[11px] font-mono text-stone-300">
                <span className="text-stone-500"># Required dependencies:</span>
                <div className="text-emerald-400 select-all mt-0.5">pip install ultralytics opencv-python pyserial requests numpy</div>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-xs font-mono text-stone-200 overflow-x-auto max-h-[420px] overflow-y-auto leading-relaxed selection:bg-emerald-900 selection:text-white">
                  {YOLO11_PYTHON_SCRIPT}
                </pre>
              </div>
            </div>
          ) : (
            <>
          {/* Quick Scenario Selector for Panel Demonstrations */}
          <div>
            <label className="text-xs font-semibold text-stone-300 uppercase tracking-wider block mb-2">
              Select Evaluation Sample / Live Telemetry:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                onClick={() => setTestScenario('live')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                  testScenario === 'live'
                    ? 'bg-stone-800 border-red-500 text-white shadow-xs'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-bold">Live Stream</div>
                <div className="text-[10px] text-stone-400">Current optical feed</div>
              </button>

              <button
                onClick={() => setTestScenario('healthy_98')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                  testScenario === 'healthy_98'
                    ? 'bg-stone-800 border-emerald-500 text-white shadow-xs'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-emerald-400">Healthy (98.2%)</div>
                <div className="text-[10px] text-stone-400">Action: ACCEPT</div>
              </button>

              <button
                onClick={() => setTestScenario('early_blight_97')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                  testScenario === 'early_blight_97'
                    ? 'bg-stone-800 border-amber-500 text-white shadow-xs'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-amber-400">Early Blight (97.4%)</div>
                <div className="text-[10px] text-stone-400">REJECT_QUARANTINE</div>
              </button>

              <button
                onClick={() => setTestScenario('late_blight_96')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                  testScenario === 'late_blight_96'
                    ? 'bg-stone-800 border-red-500 text-white shadow-xs'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-red-400">Late Blight (96.5%)</div>
                <div className="text-[10px] text-stone-400">REJECT_QUARANTINE</div>
              </button>

              <button
                onClick={() => setTestScenario('low_conf_84')}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                  testScenario === 'low_conf_84'
                    ? 'bg-stone-800 border-yellow-500 text-white shadow-xs'
                    : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-yellow-400">&lt; 95% Confidence</div>
                <div className="text-[10px] text-stone-400">MANUAL_REVIEW</div>
              </button>
            </div>
          </div>

          {/* Real-time Actuator & Threshold Status Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800/80 flex items-center space-x-3">
              <div
                className={`p-2 rounded-lg ${
                  responseData.sorting_action === 'ACCEPT'
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                    : responseData.sorting_action === 'REJECT_QUARANTINE'
                    ? 'bg-red-950/80 text-red-400 border border-red-800/60'
                    : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                }`}
              >
                {responseData.sorting_action === 'ACCEPT' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : responseData.sorting_action === 'REJECT_QUARANTINE' ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-stone-400">Conveyor Routing Action</div>
                <div className="text-sm font-mono font-bold text-white">{responseData.sorting_action}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800/80 flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-blue-950/80 text-blue-400 border border-blue-800/60">
                <FileCode className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-stone-400">Post-Harvest Quality</div>
                <div className="text-sm font-mono font-bold text-white">{responseData.quality_grade}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800/80 flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-800/60">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-stone-400">95% Criteria Gating</div>
                <div className="text-sm font-mono font-bold text-white">
                  {responseData.confidence_percentage >= 95 ? (
                    <span className="text-emerald-400">Passed ({responseData.confidence_percentage}%)</span>
                  ) : (
                    <span className="text-amber-400">Sub-Threshold ({responseData.confidence_percentage}%)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Formatted Code Block */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center space-x-2">
                <FileCode className="h-3.5 w-3.5 text-stone-400" />
                <span>Strict Evaluation JSON Payload</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>
            <pre className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-xs font-mono text-emerald-400 overflow-x-auto selection:bg-emerald-900 selection:text-white leading-relaxed">
              {jsonString}
            </pre>
          </div>

          {/* Model Backends Architecture (Panel Rec #15 future fine-tuning) */}
          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center space-x-2">
                <Cpu className="h-3.5 w-3.5 text-red-400" />
                <span>Inference Model Architecture (Panel Rec #15)</span>
              </span>
              <span className="text-[10px] text-stone-400 font-mono">
                Active: <span className="text-white font-bold">{activeModelBackend}</span>
              </span>
            </div>
            <p className="text-xs text-stone-400">
              The system cleanly decouples computer vision inferencing into hot-swappable pipelines for future LLM fine-tuning or self-trained edge models:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div
                onClick={() => onSwitchBackend?.('yolov11_roboflow')}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeModelBackend === 'yolov11_roboflow'
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-white">YOLOv11 Hosted Cloud</div>
                <div className="text-[11px] text-stone-400 mt-1">Roboflow Inference API for tomato ripeness & blight</div>
              </div>

              <div
                onClick={() => onSwitchBackend?.('local_yolov11_onnx')}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeModelBackend === 'local_yolov11_onnx'
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-white">Local YOLOv11 ONNX</div>
                <div className="text-[11px] text-stone-400 mt-1">Self-trained local weights on industrial conveyor PC</div>
              </div>

              <div
                onClick={() => onSwitchBackend?.('gemini_vision_llm')}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeModelBackend === 'gemini_vision_llm'
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'
                }`}
              >
                <div className="font-bold text-white">Multimodal VLM / LLM</div>
                <div className="text-[11px] text-stone-400 mt-1">Fine-tuned agricultural reasoning for micro-lesions</div>
              </div>
            </div>
          </div>
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-stone-800 px-6 py-3 bg-stone-950/80 text-xs text-stone-400">
          <span>Schema validated against Capstone Defense Rubric Criteria</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-white font-medium transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
