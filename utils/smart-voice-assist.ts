import type { FareVoiceType } from './voice';

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env ?? {};

const getSupabaseConfig = () => {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey =
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
      ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : typeof env.VITE_SUPABASE_ANON_KEY === 'string'
        ? env.VITE_SUPABASE_ANON_KEY.trim()
        : '';

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
};

const isBrowser = () => typeof window !== 'undefined' && typeof fetch === 'function';

export type SmartVoiceStep = 'fare' | 'fare-type' | 'cash' | 'confirm' | 'done-check' | 'next-passenger';
export type SmartVoiceShortcut = 'same-route' | 'same-cash' | 'new-route' | 'none';
export type SmartVoiceBinaryAnswer = 'yes' | 'no' | 'unknown';
export type SmartVoiceConfidence = 'low' | 'medium' | 'high';

export interface SmartVoiceStopContext {
  name: string;
  km: number;
  aliases?: string[];
}

export interface SmartVoiceFareContext {
  originStopName: string;
  destinationStopName: string;
  fareType: FareVoiceType;
}

export interface SmartVoiceAssistRequest {
  step: SmartVoiceStep;
  transcript: string;
  routeLabel: string;
  routeStops: SmartVoiceStopContext[];
  activeFare?: SmartVoiceFareContext | null;
  lastResolvedFare?: SmartVoiceFareContext | null;
  lastCashAmount?: number | null;
}

export interface SmartVoiceAssistResult {
  correctedTranscript: string;
  confidence: SmartVoiceConfidence;
  shortcut: SmartVoiceShortcut;
  binaryAnswer: SmartVoiceBinaryAnswer;
  fareType: FareVoiceType | 'unknown';
  cashAmount: number | null;
  originStopName: string | null;
  destinationStopName: string | null;
  clarificationQuestion: string | null;
  clarificationChoices: string[];
  notes: string | null;
}

const isConfidence = (value: unknown): value is SmartVoiceConfidence =>
  value === 'low' || value === 'medium' || value === 'high';

const isShortcut = (value: unknown): value is SmartVoiceShortcut =>
  value === 'same-route' || value === 'same-cash' || value === 'new-route' || value === 'none';

const isBinary = (value: unknown): value is SmartVoiceBinaryAnswer =>
  value === 'yes' || value === 'no' || value === 'unknown';

const isFareType = (value: unknown): value is FareVoiceType | 'unknown' =>
  value === 'regular' || value === 'discounted' || value === 'either' || value === 'unknown';

const extractJsonBlock = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  return objectMatch?.[0]?.trim() ?? trimmed;
};

export const hasSmartVoiceAssistConfig = () => Boolean(getSupabaseConfig());

export const analyzeSmartVoiceTranscript = async (
  request: SmartVoiceAssistRequest
): Promise<SmartVoiceAssistResult | null> => {
  const config = getSupabaseConfig();
  if (!config || !isBrowser() || !request.transcript.trim()) {
    return null;
  }

  try {
    const response = await fetch(`${config.url}/functions/v1/smart-voice-assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      },
      body: JSON.stringify({
        action: 'analyze-voice',
        ...request
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      result?: {
        correctedTranscript?: unknown;
        confidence?: unknown;
        shortcut?: unknown;
        binaryAnswer?: unknown;
        fareType?: unknown;
        cashAmount?: unknown;
        originStopName?: unknown;
        destinationStopName?: unknown;
        clarificationQuestion?: unknown;
        clarificationChoices?: unknown;
        notes?: unknown;
      } | null;
      rawText?: string;
    };

    const result = payload.result;
    if (!result) {
      if (!payload.rawText) {
        return null;
      }

      const parsedFallback = JSON.parse(extractJsonBlock(payload.rawText)) as Record<string, unknown>;
      return {
        correctedTranscript:
          typeof parsedFallback.correctedTranscript === 'string'
            ? parsedFallback.correctedTranscript.trim()
            : request.transcript.trim(),
        confidence: isConfidence(parsedFallback.confidence) ? parsedFallback.confidence : 'low',
        shortcut: isShortcut(parsedFallback.shortcut) ? parsedFallback.shortcut : 'none',
        binaryAnswer: isBinary(parsedFallback.binaryAnswer) ? parsedFallback.binaryAnswer : 'unknown',
        fareType: isFareType(parsedFallback.fareType) ? parsedFallback.fareType : 'unknown',
        cashAmount:
          typeof parsedFallback.cashAmount === 'number' && Number.isFinite(parsedFallback.cashAmount)
            ? parsedFallback.cashAmount
            : null,
        originStopName:
          typeof parsedFallback.originStopName === 'string' && parsedFallback.originStopName.trim()
            ? parsedFallback.originStopName.trim()
            : null,
        destinationStopName:
          typeof parsedFallback.destinationStopName === 'string' && parsedFallback.destinationStopName.trim()
            ? parsedFallback.destinationStopName.trim()
            : null,
        clarificationQuestion:
          typeof parsedFallback.clarificationQuestion === 'string' && parsedFallback.clarificationQuestion.trim()
            ? parsedFallback.clarificationQuestion.trim()
            : null,
        clarificationChoices: Array.isArray(parsedFallback.clarificationChoices)
          ? parsedFallback.clarificationChoices.filter((choice): choice is string => typeof choice === 'string' && choice.trim().length > 0)
          : [],
        notes:
          typeof parsedFallback.notes === 'string' && parsedFallback.notes.trim()
            ? parsedFallback.notes.trim()
            : null
      };
    }

    return {
      correctedTranscript:
        typeof result.correctedTranscript === 'string' && result.correctedTranscript.trim()
          ? result.correctedTranscript.trim()
          : request.transcript.trim(),
      confidence: isConfidence(result.confidence) ? result.confidence : 'low',
      shortcut: isShortcut(result.shortcut) ? result.shortcut : 'none',
      binaryAnswer: isBinary(result.binaryAnswer) ? result.binaryAnswer : 'unknown',
      fareType: isFareType(result.fareType) ? result.fareType : 'unknown',
      cashAmount:
        typeof result.cashAmount === 'number' && Number.isFinite(result.cashAmount)
          ? result.cashAmount
          : null,
      originStopName:
        typeof result.originStopName === 'string' && result.originStopName.trim()
          ? result.originStopName.trim()
          : null,
      destinationStopName:
        typeof result.destinationStopName === 'string' && result.destinationStopName.trim()
          ? result.destinationStopName.trim()
          : null,
      clarificationQuestion:
        typeof result.clarificationQuestion === 'string' && result.clarificationQuestion.trim()
          ? result.clarificationQuestion.trim()
          : null,
      clarificationChoices: Array.isArray(result.clarificationChoices)
        ? result.clarificationChoices.filter((choice): choice is string => typeof choice === 'string' && choice.trim().length > 0)
        : [],
      notes:
        typeof result.notes === 'string' && result.notes.trim()
          ? result.notes.trim()
          : null
    };
  } catch {
    return null;
  }
};
