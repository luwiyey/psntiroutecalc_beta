const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

type SmartVoiceStep = 'fare' | 'fare-type' | 'passenger-count' | 'cash' | 'confirm' | 'done-check' | 'next-passenger';
type SmartVoiceShortcut = 'same-route' | 'same-cash' | 'new-route' | 'none';
type SmartVoiceBinaryAnswer = 'yes' | 'no' | 'unknown';
type SmartVoiceConfidence = 'low' | 'medium' | 'high';
type SmartVoiceFareType = 'regular' | 'discounted' | 'either' | 'unknown';

interface SmartVoiceStopContext {
  name: string;
  km: number;
  aliases?: string[];
}

interface SmartVoiceFareContext {
  originStopName: string;
  destinationStopName: string;
  fareType: SmartVoiceFareType;
}

interface SmartVoiceAssistRequest {
  action?: string;
  step?: SmartVoiceStep;
  transcript?: string;
  routeLabel?: string;
  routeStops?: SmartVoiceStopContext[];
  activeFare?: SmartVoiceFareContext | null;
  lastResolvedFare?: SmartVoiceFareContext | null;
  lastCashAmount?: number | null;
}

interface SmartVoiceAssistResponse {
  correctedTranscript: string;
  confidence: SmartVoiceConfidence;
  shortcut: SmartVoiceShortcut;
  binaryAnswer: SmartVoiceBinaryAnswer;
  fareType: SmartVoiceFareType;
  passengerCount: number | null;
  cashAmount: number | null;
  originStopName: string | null;
  destinationStopName: string | null;
  clarificationQuestion: string | null;
  clarificationChoices: string[];
  notes: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });

const clampStops = (stops: SmartVoiceStopContext[]) =>
  stops.slice(0, 80).map(stop => ({
    name: String(stop.name ?? '').trim(),
    km: Number(stop.km ?? 0),
    aliases: Array.isArray(stop.aliases)
      ? stop.aliases
          .filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
          .slice(0, 24)
      : []
  }));

const extractTextFromGemini = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return '';
  }

  const firstCandidate = candidates[0];
  const parts = firstCandidate?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

const stripJsonFence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  return objectMatch?.[0]?.trim() ?? trimmed;
};

const buildPrompt = (request: SmartVoiceAssistRequest) => {
  const stopList = clampStops(request.routeStops ?? []);
  const stopsJson = JSON.stringify(stopList, null, 2);
  const activeFareJson = JSON.stringify(request.activeFare ?? null, null, 2);
  const lastResolvedFareJson = JSON.stringify(request.lastResolvedFare ?? null, null, 2);

  return `
You correct noisy conductor speech for a provincial bus fare app.
Return ONLY valid JSON. No markdown. No explanation.

Current step: ${request.step ?? 'fare'}
Current route: ${String(request.routeLabel ?? '').trim() || 'Unknown route'}
Original transcript: ${String(request.transcript ?? '').trim()}
Active fare context: ${activeFareJson}
Last resolved fare: ${lastResolvedFareJson}
Last cash amount: ${request.lastCashAmount ?? null}

Available route stops. You must only use exact stop names from this list:
${stopsJson}

Rules:
- Be conservative. If you are unsure, keep values null and use low confidence.
- The transcript may come from a noisy moving bus. Correct obvious phonetic or partial words when the intended meaning is still clear.
- Philippine stop pronunciations often swap i/e and o/u sounds, clip syllables, or use local landmark names instead of printed stop names. Use the provided aliases to recover the intended stop when reasonably clear.
- The stop list includes small KM-post places, landmark pieces, and common local references. Treat obscure stops just as valid as big terminals.
- If the transcript sounds close to any provided stop alias, landmark, or split stop name, map it back to the exact stop name from the list.
- Some printed stop names use slashes because they group nearby places under one KM-post. If the transcript closely matches one named place from that grouped stop, prefer that grouped KM-post stop instead of jumping to a different KM.
- Do not invent a different stop just because two grouped stop names share similar slash-separated words. When unsure, ask a clarification question.
- Filipino pronunciations may clip or merge syllables. McDo, Jollibee, PSU, bypass, crossing, bayan, villa, and similar local landmark words can point to a listed stop.
- Conductors may mix English and Tagalog, such as "galing X pa Y", "hanggang Y", "ibaba sa Y", "tatlo regular", or "isang daan ang bayad". Map these into the slot fields instead of asking them to repeat everything.
- Fill the slots in this order: origin, destination, fareType, passengerCount, cashAmount.
- If one answer includes more than one missing slot, return all of them at once.
- If the speaker corrects themselves in the same utterance, such as "tatlo ay hindi dalawa lang", use the latest corrected value.
- If the user likely meant "discounted", accept common noisy variants like counted, discounted, dis counted, may discount, student, senior, pwd.
- If the user likely meant yes, accept phrases like yes, yeah, yup, im done, i'm done, done, okay done, oo, opo, sige, tuloy.
- If the user likely meant no, accept phrases like no, not yet, stop, cancel, hindi, wag, tama na, exit.
- For passenger-count step, extract only the passenger count as passengerCount. Accept noisy variants like to/too for two, for/fore for four, couple for two, and single for one when they clearly mean the count.
- For fare and next-passenger steps, identify originStopName and destinationStopName only from the provided stop list.
- Prefer recovering a likely stop from the provided aliases instead of leaving originStopName or destinationStopName null when the intended stop is reasonably clear.
- If a stop is ambiguous among similar route stops, do not guess. Instead fill clarificationQuestion and clarificationChoices.
- For vague landmarks like SM, Robinsons, or terminal, ask which city, municipality, province, or nearby KM-post landmark they mean.
- When there are good candidates, clarificationChoices should prefer exact stop names from the provided stop list so the app can offer "Are you trying to say..." choices.
- For fare-type step, prefer only fareType.
- For cash step, extract only the passenger money amount as cashAmount.
- For shortcut detection, use only same-route, same-cash, new-route, or none.
- correctedTranscript should be the cleaned-up phrase the conductor most likely meant.

Return exactly this JSON shape:
{
  "correctedTranscript": "string",
  "confidence": "low|medium|high",
  "shortcut": "same-route|same-cash|new-route|none",
  "binaryAnswer": "yes|no|unknown",
  "fareType": "regular|discounted|either|unknown",
  "passengerCount": null,
  "cashAmount": null,
  "originStopName": null,
  "destinationStopName": null,
  "clarificationQuestion": null,
  "clarificationChoices": [],
  "notes": null
}
`.trim();
};

const callGemini = async (prompt: string, apiKey: string, model: string) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json'
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const rawText = extractTextFromGemini(payload);
  if (!rawText) {
    throw new Error('Gemini returned no text response.');
  }

  const parsed = JSON.parse(stripJsonFence(rawText)) as SmartVoiceAssistResponse;
  return {
    rawText,
    parsed
  };
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return json({ error: 'GEMINI_API_KEY is not configured.' }, 503);
  }

  const geminiModel = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-2.5-flash';

  try {
    const body = (await request.json()) as SmartVoiceAssistRequest;

    if (body.action !== 'analyze-voice') {
      return json({ error: 'Unsupported action.' }, 400);
    }

    if (!body.transcript?.trim()) {
      return json({ error: 'A transcript is required.' }, 400);
    }

    const prompt = buildPrompt(body);
    const result = await callGemini(prompt, geminiApiKey, geminiModel);

    return json({
      result: result.parsed,
      rawText: result.rawText
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected smart voice assist error.' },
      500
    );
  }
});
