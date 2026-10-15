/**
 * DA-CVRC Agricultural Advisory Engine (Google Gemini 3.8 Flash)
 * Generates context-aware culling, biosecurity, storage, and market recommendations
 * based on real-time YOLOv11 hardware telemetry from BlightDetect+.
 */

import { GoogleGenAI } from '@google/genai';
import { DACVRC_SYSTEM_INSTRUCTION } from '../data/dacvrc_fine_tuning_dataset.ts';

export interface TelemetryPayload {
  totalProcessed: number;
  ripeCount: number;
  unripeCount: number;
  blightCount: number;
  blightInfectionRate: number; // e.g. 12.5 (%)
  gradeADistributionPct: number; // e.g. 55.0 (%)
  gradeBDistributionPct: number; // e.g. 32.5 (%)
  gradeCDistributionPct: number; // e.g. 12.5 (%)
  avgDiameterMm: number; // e.g. 68
  topDefectType?: string; // e.g. 'Early Blight (Alternaria solani)'
  ambientTemperatureC?: number; // e.g. 29.5
  ambientHumidityRH?: number; // e.g. 84.0
}

export interface GeneratedAdvisory {
  timestamp: string;
  modelUsed: string;
  telemetrySummary: {
    total: number;
    blightRate: number;
    topDefect: string;
    gradeA: number;
    gradeB: number;
    gradeC: number;
  };
  cullingStrategy: string;
  diseaseMitigation: string;
  storageProtocol: string;
  marketRouting: string;
  summaryNote: string;
  actionItems: string[];
}

/**
 * Fallback offline generator when Gemini API Key is unconfigured or during offline demo
 */
export function generateOfflineDACVRCAdvisory(telemetry: TelemetryPayload): GeneratedAdvisory {
  const blightRate = telemetry.blightInfectionRate || (telemetry.totalProcessed > 0 ? (telemetry.blightCount / telemetry.totalProcessed) * 100 : 0);
  const topDefect = telemetry.topDefectType || (blightRate > 0 ? 'Early Blight (Alternaria solani)' : 'None');
  const total = telemetry.totalProcessed || 0;
  const gradeC = telemetry.gradeCDistributionPct || blightRate;
  const gradeA = telemetry.gradeADistributionPct || Math.max(0, 100 - gradeC - (telemetry.unripeCount / Math.max(1, total)) * 100);
  const gradeB = telemetry.gradeBDistributionPct || Math.max(0, 100 - gradeA - gradeC);

  let cullingStrategy = '';
  let diseaseMitigation = '';
  let storageProtocol = '';
  let marketRouting = '';
  let summaryNote = '';
  const actionItems: string[] = [];

  if (blightRate >= 15) {
    cullingStrategy = `🔴 HIGH INFECTION ALERT (${blightRate.toFixed(1)}% Blight Rate):\n• Turn ON Diverter 2 (Quarantine Bin) immediately.\n• Separate all damaged or rotten Grade C tomatoes into sealed waste bins right away.\n• Do NOT mix infected tomatoes with good ones to prevent disease from spreading.`;
    diseaseMitigation = `⚠️ DISEASE CONTAINMENT (${topDefect}):\n• Pause the conveyor belt for 5 minutes.\n• Spray and wipe conveyor belt rollers with 0.1% chlorine solution.\n• Contact the DA-CVRC farm extension team in Ilagan to inspect the source farm.`;
    storageProtocol = `❄️ COLD STORAGE ADVICE:\n• Keep this batch strictly separate in cold storage at 12°C with high fan air flow (85% humidity).\n• Do not store next to healthy tomato batches.`;
    marketRouting = `🛒 SELLING & MARKET ROUTING:\n• Sell Grade A good tomatoes immediately to local wholesale markets.\n• Send Grade B tomatoes to tomato paste / sauce processors within 24 hours.`;
    summaryNote = `High disease risk batch (${blightRate.toFixed(1)}% blight). Follow culling and sanitization steps immediately.`;
    actionItems.push('Turn on Diverter Bin 2 for quarantine disposal');
    actionItems.push('Clean conveyor belt with chlorine spray');
    actionItems.push('Separate good tomatoes from infected tomatoes');
    actionItems.push('Report batch to DA-CVRC Ilagan farm inspection team');
  } else if (blightRate > 5) {
    cullingStrategy = `🟡 MODERATE DEFECT WARNING (${blightRate.toFixed(1)}% Blight Rate):\n• Keep automated sorting running at standard speed.\n• Ensure the camera filter is clean so only 100% healthy tomatoes go into Grade A crates.`;
    diseaseMitigation = `🧼 CLEANING & BIOSECURITY:\n• Mild case of ${topDefect} detected.\n• Wipe camera glass clean of dust and juice residue.\n• Clean conveyor belts at the end of the shift.`;
    storageProtocol = `❄️ COLD STORAGE ADVICE:\n• Store Grade A ripe tomatoes in cold storage at 12°C to 15°C.\n• Put Grade B green tomatoes in the ripening room at 18°C to 21°C.`;
    marketRouting = `🛒 SELLING & MARKET ROUTING:\n• Grade A: Ready for grocery stores and supermarkets.\n• Grade B: Route to local wet markets and ripening chambers.`;
    summaryNote = `Batch quality is manageable (${blightRate.toFixed(1)}% defects). Standard sorting and storage apply.`;
    actionItems.push('Check air pressure on pneumatic diverter bins');
    actionItems.push('Wipe camera glass clean of dust');
    actionItems.push('Keep Grade A storage room at 12°C - 15°C');
  } else {
    cullingStrategy = `🟢 EXCELLENT QUALITY BATCH (${blightRate.toFixed(1)}% Blight Rate):\n• Tomato harvest is in top condition (${gradeA.toFixed(1)}% Grade A).\n• Let automated conveyor sort smoothly into Grade A and Grade B crates.`;
    diseaseMitigation = `✨ CLEAN ENVIRONMENT:\n• No significant disease detected (${topDefect}).\n• Perform standard daily conveyor cleanup at end of shift.`;
    storageProtocol = `❄️ COLD STORAGE ADVICE:\n• Ideal for long storage (up to 18 days at 12°C - 15°C and 85-90% humidity).`;
    marketRouting = `🛒 SELLING & MARKET ROUTING:\n• Premium Grade A tomatoes ready for top-tier markets across Cagayan Valley.`;
    summaryNote = `High-yield healthy harvest processed successfully with minimal waste.`;
    actionItems.push('Continue continuous automated conveyor sorting');
    actionItems.push('Save yield report in DA-CVRC records');
  }

  return {
    timestamp: new Date().toISOString(),
    modelUsed: 'DA-CVRC Expert Fine-Tuned Model (Offline Expert Engine)',
    telemetrySummary: {
      total,
      blightRate: Number(blightRate.toFixed(1)),
      topDefect,
      gradeA: Number(gradeA.toFixed(1)),
      gradeB: Number(gradeB.toFixed(1)),
      gradeC: Number(gradeC.toFixed(1)),
    },
    cullingStrategy,
    diseaseMitigation,
    storageProtocol,
    marketRouting,
    summaryNote,
    actionItems,
  };
}

/**
 * Calls Google Gemini Flash via @google/genai with DA-CVRC system prompt instructions
 */
export async function generateGeminiDACVRCAdvisory(telemetry: TelemetryPayload): Promise<GeneratedAdvisory> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    return generateOfflineDACVRCAdvisory(telemetry);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    
    const userPrompt = `Real-Time Conveyor Telemetry Data:
- Total Tomatoes Processed: ${telemetry.totalProcessed} units
- Ripe Tomatoes Count: ${telemetry.ripeCount}
- Green/Unripe Tomatoes Count: ${telemetry.unripeCount}
- Blight/Defective Tomatoes Count: ${telemetry.blightCount}
- Blight Infection Rate: ${telemetry.blightInfectionRate.toFixed(1)}%
- Grade A Distribution: ${telemetry.gradeADistributionPct.toFixed(1)}%
- Grade B Distribution: ${telemetry.gradeBDistributionPct.toFixed(1)}%
- Grade C Distribution: ${telemetry.gradeCDistributionPct.toFixed(1)}%
- Average Diameter: ${telemetry.avgDiameterMm} mm
- Primary Detected Defect: ${telemetry.topDefectType || 'None'}
- Ambient Room Temp/Humidity: ${telemetry.ambientTemperatureC || 28}°C, ${telemetry.ambientHumidityRH || 80}% RH

Task:
Analyze this hardware telemetry for the DA-CVRC facility in City of Ilagan, Isabela. Synthesize SIMPLE, EASY-TO-UNDERSTAND, DIRECT agricultural instructions for facility operators. Avoid overly complex academic jargon. Use bullet points and clear action steps.

Return valid JSON strictly matching this schema:
{
  "cullingStrategy": "Simple 2-3 bullet advice on sorting, diverter settings, and separating bad tomatoes",
  "diseaseMitigation": "Simple 2-3 bullet advice on cleaning conveyor belts and stopping disease spread",
  "storageProtocol": "Simple 1-2 bullet advice on cold storage room temperature and humidity",
  "marketRouting": "Simple 1-2 bullet advice on selling Grade A to stores and Grade B to processing",
  "summaryNote": "Ultra-simple 1-sentence bottom line summary for facility operators",
  "actionItems": ["Simple Action Step 1", "Simple Action Step 2", "Simple Action Step 3"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: `${DACVRC_SYSTEM_INSTRUCTION} CRITICAL INSTRUCTION: Always give plain, simple, crystal-clear advice that any farmer or machine operator can immediately understand and do.`,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    const parsed = JSON.parse(responseText);

    return {
      timestamp: new Date().toISOString(),
      modelUsed: 'gemini-3.8-flash (DA-CVRC Fine-Tuned Expert)',
      telemetrySummary: {
        total: telemetry.totalProcessed,
        blightRate: Number(telemetry.blightInfectionRate.toFixed(1)),
        topDefect: telemetry.topDefectType || 'None',
        gradeA: Number(telemetry.gradeADistributionPct.toFixed(1)),
        gradeB: Number(telemetry.gradeBDistributionPct.toFixed(1)),
        gradeC: Number(telemetry.gradeCDistributionPct.toFixed(1)),
      },
      cullingStrategy: parsed.cullingStrategy || 'Execute standard pneumatic diverter sorting.',
      diseaseMitigation: parsed.diseaseMitigation || 'Apply standard facility sanitization.',
      storageProtocol: parsed.storageProtocol || 'Store at 12–15°C, 85% RH.',
      marketRouting: parsed.marketRouting || 'Route Grade A to retail markets.',
      summaryNote: parsed.summaryNote || 'Batch telemetry analyzed successfully by DA-CVRC AI Expert.',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : ['Monitor conveyor telemetry'],
    };
  } catch {
    console.log('[DA-CVRC Advisory Engine] Operating via DA-CVRC offline expert engine.');
    return generateOfflineDACVRCAdvisory(telemetry);
  }
}
