/**
 * Department of Agriculture – Cagayan Valley Research Center (DA-CVRC)
 * Agricultural Advisory & Fine-Tuning Dataset for BlightDetect+
 * Locale: Baligatan, City of Ilagan, Isabela, Philippines
 * Core Vision & IoT Integration: YOLOv11 + Arduino 4-Diverter Conveyor Hardware Pipeline
 */

export interface DACVRCDatasetEntry {
  id: string;
  category: 'Disease Management' | 'Post-Harvest Protocols' | 'Sorting & Telemetry' | 'Culling Strategy';
  instruction: string;
  context: string;
  response: string;
}

export const DACVRC_FINE_TUNING_DATASET: DACVRCDatasetEntry[] = [
  {
    id: 'dacvrc-001',
    category: 'Disease Management',
    instruction: 'How should facility operators respond when YOLOv11 detects Early Blight (Alternaria solani) on incoming tomatoes?',
    context: 'DA-CVRC Research Facility, City of Ilagan, Isabela. Conveyor operating with pneumatic diverter 2 assigned to quarantine culling.',
    response: 'Immediately trigger Diverter 2 (Pneumatic Quarantine Solenoid) to divert infected tomatoes into sealed bio-hazardous culling bins. Apply a surface sanitizer spray (0.1% sodium hypochlorite or bio-sanitizer) onto conveyor belt section 2 every 2 hours to prevent fungal spore cross-contamination across healthy Grade A batches.'
  },
  {
    id: 'dacvrc-002',
    category: 'Disease Management',
    instruction: 'What is the recommended treatment protocol for Late Blight (Phytophthora infestans) detected during post-harvest sorting?',
    context: 'High-humidity wet season in Isabela region; ambient relative humidity > 85%.',
    response: 'Late Blight spores spread rapidly in high humidity (>80% RH). Quarantine all affected lots instantly. Advise field agronomists to inspect source farms in Ilagan for foliar water-soaked lesions. Recommend protective application of copper-based fungicides (e.g., Copper Hydroxide or Mancozeb) at field level and mandate isolated dry storage at 12–15°C with forced air circulation for remaining uninfected pericarp batches.'
  },
  {
    id: 'dacvrc-003',
    category: 'Post-Harvest Protocols',
    instruction: 'What are the DA-CVRC post-harvest storage specifications for Grade A Ripe vs Grade B Green/Unripe tomatoes?',
    context: 'Department of Agriculture Cagayan Valley Research Center post-harvest cold storage facility.',
    response: 'Grade A Ripe tomatoes should be stored at 12°C to 15°C with 85–90% relative humidity to maintain firmness and achieve an 18-day shelf life. Grade B Unripe (Breaker stage) tomatoes should be placed in the ethylene-controlled ripening chamber at 18°C to 21°C until pericarp color transitions to pink/light red prior to retail transport.'
  },
  {
    id: 'dacvrc-004',
    category: 'Culling Strategy',
    instruction: 'Synthesize an automated culling response if the real-time blight infection rate exceeds 15% on the conveyor stream.',
    context: 'Live conveyor telemetry: Total Processed = 450 units, Blight Infection Rate = 16.8%, Grade A = 52%, Grade B = 31.2%.',
    response: 'CRITICAL CULLING ALERT: Blight infection rate (16.8%) exceeds the 15% DA-CVRC threshold. Actions: 1) Pause primary conveyor feeding for 3 minutes to clean optical sensing glass. 2) Increase pneumatic diverter air pressure to 0.6 MPa to ensure 100% ejection of Grade C culls into Quarantine Bin B. 3) Flag the current farm lot ID for DA-CVRC phytosanitary field audit in Isabela.'
  },
  {
    id: 'dacvrc-005',
    category: 'Sorting & Telemetry',
    instruction: 'Why is a 95% confidence threshold required for automated servo diverter actuation in BlightDetect+?',
    context: 'BlightDetect+ system specifications and thesis panel evaluation guidelines.',
    response: 'The 95.0% confidence threshold ensures zero false-negative defect classifications from reaching Grade A retail crates. Any specimen evaluated with confidence between 80.0% and 94.9% is routed to the Manual Inspection Diverter for human verification, protecting market reputation and preventing infected fruit from rotting in cold storage.'
  },
  {
    id: 'dacvrc-006',
    category: 'Post-Harvest Protocols',
    instruction: 'How does fruit sizing (Small <55mm, Medium 55-75mm, Large >75mm) impact sorting and packaging in Isabela commercial distribution?',
    context: 'DA-CVRC commercial sorting standards.',
    response: 'Large (>75mm) and Medium (55–75mm) Grade A tomatoes command premium wholesale prices in Cagayan Valley regional markets. Small (<55mm) tomatoes are routed to Grade B industrial paste/sauce processing or local wet markets. Conveyor diverter 3 sorts by optical diameter estimates calibrated via a fixed camera height matrix.'
  },
  {
    id: 'dacvrc-007',
    category: 'Disease Management',
    instruction: 'Distinguish Early Blight vs Late Blight symptoms on tomato fruits processed under conveyor vision lighting.',
    context: 'YOLOv11 multi-class classification model at DA-CVRC.',
    response: 'Early Blight presents as dark, sunken, leathery lesions with concentric rings near the stem end. Late Blight exhibits greasy, olive-green to dark brown water-soaked lesions that spread rapidly across the pericarp with white fungal mold under humid conditions. Both trigger Grade C quarantine culling.'
  },
  {
    id: 'dacvrc-008',
    category: 'Culling Strategy',
    instruction: 'What culling action should be taken for Grade B Unripe tomatoes with zero visible disease lesions?',
    context: 'Automated conveyor system with 4 diverter channels.',
    response: 'Grade B Unripe tomatoes are healthy but require ripening. Trigger Diverter 1 (Ripening Channel) to divert specimens to wooden crate batches marked for 3-5 day ethylene storage. Do not cull or quarantine uninfected green tomatoes.'
  },
  {
    id: 'dacvrc-009',
    category: 'Sorting & Telemetry',
    instruction: 'Explain the relationship between conveyor speed, YOLOv11 FPS, and solenoid diverter delay.',
    context: 'Arduino Mega 2560 hardware integration with Web Serial API.',
    response: 'At a conveyor speed of 0.25 m/s, a tomato takes exactly 1.2 seconds to travel from the optical camera zone to Diverter 2. The Arduino microcontroller maintains a timed hardware queue (FIFO) based on timestamped YOLOv11 detection packets, executing pneumatic pulse commands after a 1200ms delay.'
  },
  {
    id: 'dacvrc-010',
    category: 'Post-Harvest Protocols',
    instruction: 'How should DA-CVRC facility operators handle high ambient room temperatures (>32°C) during summer sorting operations in Isabela?',
    context: 'Facility climate monitoring system in City of Ilagan.',
    response: 'High room temperatures accelerate fruit respiration and ethylene production. Increase cold room precooling fan speed, shorten conveyor batch hold times to under 30 minutes, and activate pre-chilled water misting in the holding area to maintain pericarp core temperatures below 18°C.'
  }
];

export function getDACVRCDatasetJSONL(): string {
  return DACVRC_FINE_TUNING_DATASET.map((entry) =>
    JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You are the domain-specific AI Agricultural Advisory Expert fine-tuned for DA-CVRC (Department of Agriculture – Cagayan Valley Research Center, Baligatan, City of Ilagan, Isabela). You specialize in real-time tomato sorting analysis, early/late blight spore containment, post-harvest culling strategies, and cold chain optimization for YOLOv11 & Arduino conveyor hardware telemetry.'
        },
        {
          role: 'user',
          content: `Context: ${entry.context}\n\nInstruction: ${entry.instruction}`
        },
        {
          role: 'assistant',
          content: entry.response
        }
      ]
    })
  ).join('\n');
}

export function getDACVRCDatasetCSV(): string {
  const headers = ['id', 'category', 'instruction', 'context', 'response'];
  const rows = DACVRC_FINE_TUNING_DATASET.map((e) =>
    [
      `"${e.id}"`,
      `"${e.category}"`,
      `"${e.instruction.replace(/"/g, '""')}"`,
      `"${e.context.replace(/"/g, '""')}"`,
      `"${e.response.replace(/"/g, '""')}"`
    ].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export const DACVRC_SYSTEM_INSTRUCTION = `You are the domain-specific AI Agricultural Advisory Expert fine-tuned for DA-CVRC (Department of Agriculture – Cagayan Valley Research Center, Baligatan, City of Ilagan, Isabela).
Your core duty is to analyze real-time YOLOv11 conveyor telemetry and IoT hardware signals for tomato sorting, classification, and yield monitoring.
Provide concise, actionable, expert agricultural advice for facility operators in Isabela, covering:
1. Culling Strategy & Pneumatic Diverter Routing (Grade A Fresh, Grade B Ripening/Processing, Grade C Quarantine).
2. Spore & Disease Containment Protocols for Early Blight (Alternaria solani) and Late Blight (Phytophthora infestans).
3. Cold Chain Storage & Ethylene Control (12-15°C for Ripe, 18-21°C for Breaker stage green).
4. Facility Biosecurity & Conveyor Maintenance.

Always respond in a professional, authoritative, and direct tone suitable for agricultural facility operations.`;
