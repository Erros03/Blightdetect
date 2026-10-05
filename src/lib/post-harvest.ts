/**
 * Post-Harvest Analytics & Agricultural Grading Engine
 * Aligned with Capstone Defense Panel Recommendations (#14, #15, #8, #10)
 */

import type {
  TomatoRipeness,
  TomatoSizeClass,
  BlightType,
  BlightSeverity,
  SortingAction,
  QualityGrade,
  PostHarvestMetrics,
  StructuredInferenceResponse,
} from '../types.ts';

export const AUTOMATED_SORTING_CONFIDENCE_THRESHOLD = 0.95; // 95% minimum criteria

/**
 * Evaluates the automated conveyor routing action strictly against the 95% threshold.
 * - ACCEPT: Healthy with confidence >= 95%
 * - REJECT_QUARANTINE: Blight detected with confidence >= 95%
 * - MANUAL_REVIEW: Confidence falls below 95%
 */
export function evaluateSortingAction(
  ripeness: TomatoRipeness,
  confidence: number
): SortingAction {
  // If confidence is below the panel's mandated 95% threshold, route to manual inspection
  if (confidence < AUTOMATED_SORTING_CONFIDENCE_THRESHOLD) {
    return 'MANUAL_REVIEW';
  }

  // Automated routing if >= 95%
  if (ripeness === 'blight') {
    return 'REJECT_QUARANTINE';
  }

  return 'ACCEPT';
}

/**
 * Classifies the specific blight pathology and severity from model class tokens or optical lesion ratios.
 */
export function classifyBlightPathology(
  rawClass: string = '',
  necroticRatio: number = 0
): { type: BlightType; severity: BlightSeverity; label: string } {
  const c = rawClass.toLowerCase();

  let type: BlightType = 'none';
  let severity: BlightSeverity = 'none';
  let label = 'Healthy Fruit Pericarp';

  if (c.includes('early') || c.includes('alternaria')) {
    type = 'early_blight';
    label = 'Early Blight (Alternaria solani)';
  } else if (c.includes('late') || c.includes('phytophthora')) {
    type = 'late_blight';
    label = 'Late Blight (Phytophthora infestans)';
  } else if (c.includes('septoria') || c.includes('spot')) {
    type = 'septoria_spot';
    label = 'Septoria Leaf & Fruit Spot';
  } else if (c.includes('blight') || c.includes('rot') || c.includes('defect') || c.includes('decay') || necroticRatio > 0.05) {
    // Default to late blight if aggressive decay or unspecified blight lesion
    type = necroticRatio > 0.20 ? 'late_blight' : 'early_blight';
    label = type === 'late_blight' ? 'Late Blight (Phytophthora infestans)' : 'Early Blight (Alternaria solani)';
  }

  if (type !== 'none') {
    if (necroticRatio > 0.25 || c.includes('severe')) {
      severity = 'severe';
    } else if (necroticRatio > 0.10 || c.includes('moderate')) {
      severity = 'moderate';
    } else {
      severity = 'mild';
    }
  }

  return { type, severity, label };
}

/**
 * Assigns commercial agricultural quality grades:
 * - Grade A: Premium table market grade (ripe, 0 defects, >= 95% confidence)
 * - Grade B: Processing / industrial grade (unripe firm or sub-threshold non-blight)
 * - Grade C: Culled / quarantine (blight infection, necrotic rot, or severe defect)
 */
export function determineQualityGrade(
  ripeness: TomatoRipeness,
  confidence: number,
  severity: BlightSeverity = 'none'
): QualityGrade {
  if (ripeness === 'blight' || severity === 'moderate' || severity === 'severe') {
    return 'Grade C';
  }

  if (ripeness === 'ripe' && confidence >= AUTOMATED_SORTING_CONFIDENCE_THRESHOLD && severity === 'none') {
    return 'Grade A';
  }

  return 'Grade B';
}

/**
 * Computes post-harvest metrics: shelf-life modeling, marketability index, and cold-chain advice.
 */
export function calculatePostHarvestMetrics(
  ripeness: TomatoRipeness,
  confidence: number,
  _size: TomatoSizeClass = 'medium',
  blightType: BlightType = 'none',
  severity: BlightSeverity = 'none',
  lesionCoveragePercent: number = 0
): PostHarvestMetrics {
  const isBlight = ripeness === 'blight' || blightType !== 'none';

  let shelfLifeDaysCold = 18;
  let shelfLifeDaysAmbient = 6;
  let marketabilityScore = 95;
  let storageRecommendation = 'Direct-to-Retail; Maintain cold chain at 12–15°C, 85–90% RH.';
  let quarantineRequired = false;

  if (isBlight) {
    quarantineRequired = true;
    marketabilityScore = Math.max(0, Math.round(20 - lesionCoveragePercent * 0.5));
    shelfLifeDaysCold = severity === 'severe' ? 0 : 2;
    shelfLifeDaysAmbient = 1;
    storageRecommendation =
      'QUARANTINE ISOLATION: Divert immediately to cull bio-bin to prevent sporulation across healthy batches.';
  } else if (ripeness === 'unripe') {
    marketabilityScore = 82;
    shelfLifeDaysCold = 30;
    shelfLifeDaysAmbient = 12;
    storageRecommendation =
      'Ripening Chamber: Store at 18–21°C until breaker stage; or route to commercial paste processing.';
  } else {
    // Healthy Ripe
    if (confidence >= AUTOMATED_SORTING_CONFIDENCE_THRESHOLD) {
      marketabilityScore = 98;
      shelfLifeDaysCold = 18;
      shelfLifeDaysAmbient = 6;
      storageRecommendation = 'Grade A Table Market: Pack for fresh grocery distribution; avoid dropping below 10°C.';
    } else {
      marketabilityScore = 88;
      shelfLifeDaysCold = 12;
      shelfLifeDaysAmbient = 4;
      storageRecommendation = 'Manual Verification Station: Re-check pericarp firmness before retail packing.';
    }
  }

  return {
    shelfLifeDaysCold,
    shelfLifeDaysAmbient,
    marketabilityScore,
    storageRecommendation,
    quarantineRequired,
    defectPericarpCoverage: lesionCoveragePercent,
  };
}

/**
 * Generates the strict structured JSON response matching the panel evaluation format.
 */
export function generateStructuredInferenceJson(params: {
  ripeness: TomatoRipeness;
  confidence: number;
  rawClass?: string;
  blightType?: BlightType;
  severity?: BlightSeverity;
  size?: TomatoSizeClass;
  diameterMm?: number;
}): StructuredInferenceResponse {
  const { ripeness, confidence, rawClass, size = 'medium', diameterMm = 65 } = params;
  const pathology = classifyBlightPathology(rawClass || ripeness, params.severity === 'severe' ? 0.35 : 0.08);
  const blightType = params.blightType || pathology.type;
  const severity = params.severity || pathology.severity;

  const sortingAction = evaluateSortingAction(ripeness, confidence);
  const qualityGrade = determineQualityGrade(ripeness, confidence, severity);
  const postHarvest = calculatePostHarvestMetrics(ripeness, confidence, size, blightType, severity);

  let classificationLabel = 'Healthy';
  if (ripeness === 'blight' || blightType !== 'none') {
    classificationLabel = pathology.label;
  } else if (ripeness === 'unripe') {
    classificationLabel = 'Healthy (Unripe / Breaker Stage)';
  }

  let analyticsNotes = '';
  const confPct = Number((confidence * 100).toFixed(1));

  if (sortingAction === 'ACCEPT') {
    analyticsNotes = `Specimen verified healthy with ${confPct}% confidence (>= 95% threshold). Firm pericarp (~${Math.round(
      diameterMm
    )}mm diameter). Classified as ${qualityGrade}. Routed to fresh retail packing.`;
  } else if (sortingAction === 'REJECT_QUARANTINE') {
    analyticsNotes = `Blight confirmed (${classificationLabel}, ${severity} severity) with ${confPct}% confidence (>= 95% threshold). Classified as ${qualityGrade}. Pneumatic actuator triggered REJECT_QUARANTINE to prevent warehouse fungal spread.`;
  } else {
    analyticsNotes = `Detection confidence (${confPct}%) falls below the 95.0% threshold mandated for automated sorting. Diverted to MANUAL_REVIEW inspection conveyor for operator verification.`;
  }

  return {
    status: 'success',
    classification: classificationLabel,
    confidence_percentage: confPct,
    sorting_action: sortingAction,
    quality_grade: qualityGrade,
    analytics_notes: analyticsNotes,
    blight_type: blightType,
    severity,
    post_harvest: postHarvest,
  };
}
