import type { RouteProfile, Stop } from '../types';
import { calculateFare } from './fare';

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

export type SpeechRecognitionEventLike = {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

export type SpeechRecognitionErrorLike = {
  error?: string;
  message?: string;
};

export interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: null | (() => void);
  onresult: null | ((event: SpeechRecognitionEventLike) => void);
  onerror: null | ((event: SpeechRecognitionErrorLike) => void);
  onend: null | (() => void);
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export type VoiceConfidenceTone = 'unknown' | 'low' | 'medium' | 'high';
export type FareVoiceType = 'regular' | 'discounted' | 'either';

export type FareVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      fareType: FareVoiceType;
      originStop: Stop;
      destinationStop: Stop;
      distance: number;
      regularFare: number;
      discountedFare: number;
    };

export type CalculatorVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      expression: string;
      prettyExpression: string;
    };

export type TallyVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      expression: string;
      prettyExpression: string;
      entries: number[];
    };

export type StopVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      stop: Stop;
    };

export type TallyNavigationCommand =
  | 'previous-box'
  | 'next-box'
  | 'next-block'
  | 'standard-mode'
  | 'batch-mode'
  | 'open-calculator'
  | 'finalize-session';

export type TallyNavigationVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      command: TallyNavigationCommand;
      label: string;
      requiresConfirmation: boolean;
    };

export type BatchCountVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      quantity: number;
      fare: number;
    };

export type TallyBatchFollowUpCommand = 'next-batch' | 'finalize-session' | 'exit';

export type TallyBatchFollowUpVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      command: TallyBatchFollowUpCommand;
      label: string;
    };

export type FareTypeVoiceAnswer = Exclude<FareVoiceType, 'either'>;
export type VoiceBinaryAnswer = 'yes' | 'no';
export type FareConversationShortcut =
  | {
      command: 'same-route';
      fareType: FareTypeVoiceAnswer | null;
    }
  | {
      command: 'same-cash';
    }
  | {
      command: 'new-route';
    };

export type CashVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      amount: number;
      spokenAmount: string;
    };

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  sero: '0',
  oh: '0',
  o: '0',
  one: '1',
  isa: '1',
  isang: '1',
  two: '2',
  dalawa: '2',
  dalawang: '2',
  three: '3',
  tatlo: '3',
  tatlong: '3',
  four: '4',
  apat: '4',
  five: '5',
  lima: '5',
  limang: '5',
  six: '6',
  anim: '6',
  seven: '7',
  pito: '7',
  pitong: '7',
  eight: '8',
  walo: '8',
  walong: '8',
  nine: '9',
  siyam: '9'
};

const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  sero: 0,
  oh: 0,
  o: 0,
  one: 1,
  isa: 1,
  isang: 1,
  two: 2,
  dalawa: 2,
  dalawang: 2,
  three: 3,
  tatlo: 3,
  tatlong: 3,
  four: 4,
  apat: 4,
  five: 5,
  lima: 5,
  limang: 5,
  six: 6,
  anim: 6,
  seven: 7,
  pito: 7,
  pitong: 7,
  eight: 8,
  walo: 8,
  walong: 8,
  nine: 9,
  siyam: 9,
  ten: 10,
  sampu: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
};

const TENS_NUMBER_WORDS: Record<string, number> = {
  twenty: 20,
  dalawampu: 20,
  thirty: 30,
  tatlumpu: 30,
  forty: 40,
  apatnapu: 40,
  fifty: 50,
  limampu: 50,
  sixty: 60,
  animnapu: 60,
  seventy: 70,
  pitumpu: 70,
  eighty: 80,
  walumpu: 80,
  ninety: 90,
  siyamnapu: 90
};

const OPERATOR_TOKENS = new Set(['+', '-', '*', '/']);

const cleanWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeStopText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[()]/g, ' ')
      .replace(/[\/,.-]/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
  );

const normalizeCalculatorText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/multiplied by/g, ' * ')
      .replace(/multiply by/g, ' * ')
      .replace(/times/g, ' * ')
      .replace(/x/g, ' * ')
      .replace(/divided by/g, ' / ')
      .replace(/divide by/g, ' / ')
      .replace(/over/g, ' / ')
      .replace(/plus/g, ' + ')
      .replace(/add/g, ' + ')
      .replace(/minus/g, ' - ')
      .replace(/less/g, ' - ')
      .replace(/point/g, ' point ')
      .replace(/dot/g, ' point ')
      .replace(/[^a-z0-9+*/.\-\s]/g, ' ')
  );

const normalizeCashText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/\bmagkano\b/g, ' ')
      .replace(/\ba hundred\b/g, 'one hundred')
      .replace(/\ban hundred\b/g, 'one hundred')
      .replace(/\bhow much\b/g, ' ')
      .replace(/\btheir money is\b/g, ' ')
      .replace(/\bthe money is\b/g, ' ')
      .replace(/\btheir cash is\b/g, ' ')
      .replace(/\bthe cash is\b/g, ' ')
      .replace(/\bthe passenger gave\b/g, ' ')
      .replace(/\bpassenger gave\b/g, ' ')
      .replace(/\bthey gave\b/g, ' ')
      .replace(/\bhe gave\b/g, ' ')
      .replace(/\bshe gave\b/g, ' ')
      .replace(/\bgave\b/g, ' ')
      .replace(/\bpaid with\b/g, ' ')
      .replace(/\bpaid\b/g, ' ')
      .replace(/\bcash\b/g, ' ')
      .replace(/\bmoney\b/g, ' ')
      .replace(/\bamount\b/g, ' ')
      .replace(/\bphp\b/g, ' ')
      .replace(/\bpesos?\b/g, ' ')
      .replace(/\bpeso\b/g, ' ')
      .replace(/\bplease\b/g, ' ')
      .replace(/\bjust\b/g, ' ')
      .replace(/\bwith\b/g, ' ')
      .replace(/\bpaying\b/g, ' ')
      .replace(/\bbayad\b/g, ' ')
      .replace(/\bpera\b/g, ' ')
      .replace(/\bsukli\b/g, ' ')
      .replace(/\bang\b/g, ' ')
      .replace(/\byung\b/g, ' ')
      .replace(/\bpo\b/g, ' ')
      .replace(/\bho\b/g, ' ')
      .replace(/\blang\b/g, ' ')
      .replace(/point/g, ' point ')
      .replace(/dot/g, ' point ')
      .replace(/[^a-z0-9.\s]/g, ' ')
  );

const normalizeTallyVoiceText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/and then/g, ' + ')
      .replace(/\band\b/g, ' + ')
      .replace(/plus/g, ' + ')
      .replace(/add/g, ' + ')
      .replace(/same again/g, ' repeat ')
      .replace(/again/g, ' repeat ')
      .replace(/repeat/g, ' repeat ')
      .replace(/\bn\b/g, ' repeat ')
      .replace(/[^a-z0-9+.\s]/g, ' ')
  );

const normalizeBatchCountVoiceText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/\bthere are\b/g, ' ')
      .replace(/\bthere is\b/g, ' ')
      .replace(/\bmayroong\b/g, ' ')
      .replace(/\bmerong\b/g, ' ')
      .replace(/\bmeron\b/g, ' ')
      .replace(/\bmay\b/g, ' ')
      .replace(/\bwith\b/g, ' ')
      .replace(/\bworth\b/g, ' ')
      .replace(/\beach\b/g, ' ')
      .replace(/\bphp\b/g, ' pesos ')
      .replace(/[^a-z0-9.\s]/g, ' ')
  );

const normalizeStopVoiceText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/\bpick[\s-]?up\b/g, ' ')
      .replace(/\bdestination\b/g, ' ')
      .replace(/\bselect\b/g, ' ')
      .replace(/\bchoose\b/g, ' ')
      .replace(/\bset\b/g, ' ')
      .replace(/\bplease\b/g, ' ')
      .replace(/\bstop\b/g, ' ')
      .replace(/\bpoint\b/g, ' ')
      .replace(/\broute\b/g, ' ')
      .replace(/\buse\b/g, ' ')
      .replace(/\bgo to\b/g, ' ')
      .replace(/\bto\b/g, ' ')
      .replace(/\bfrom\b/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
  );

const isBoundary = (value: string | undefined) => !value || value === ' ';

const getPhraseIndexes = (text: string, phrase: string) => {
  const indexes: number[] = [];
  if (!phrase) return indexes;

  let startIndex = 0;
  while (startIndex < text.length) {
    const nextIndex = text.indexOf(phrase, startIndex);
    if (nextIndex === -1) break;

    const before = text[nextIndex - 1];
    const after = text[nextIndex + phrase.length];
    if (isBoundary(before) && isBoundary(after)) {
      indexes.push(nextIndex);
    }

    startIndex = nextIndex + phrase.length;
  }

  return indexes;
};

const createAliasCandidates = (stop: Stop) => {
  const rawSeeds = new Set<string>([stop.name, ...(stop.aliases ?? [])]);
  const candidates = new Set<string>();

  rawSeeds.forEach(seed => {
    const normalized = normalizeStopText(seed);
    if (normalized) candidates.add(normalized);

    seed
      .split(/[\/(),-]/g)
      .map(part => normalizeStopText(part))
      .filter(part => part.length >= 3)
      .forEach(part => candidates.add(part));
  });

  const baseName = normalizeStopText(stop.name);
  if (baseName && !baseName.endsWith(' city')) {
    candidates.add(`${baseName} city`);
  }

  return [...candidates];
};

const buildStopAliasEntries = (route: RouteProfile) => {
  const entries = route.stops.flatMap(stop =>
    createAliasCandidates(stop).map(alias => ({
      alias,
      stop
    }))
  );

  return entries.sort((left, right) => right.alias.length - left.alias.length);
};

const pickStopFromSegment = (
  segment: string,
  entries: ReturnType<typeof buildStopAliasEntries>,
  preference: 'first' | 'last'
) => {
  const matches = entries
    .flatMap(entry =>
      getPhraseIndexes(segment, entry.alias).map(index => ({
        index,
        aliasLength: entry.alias.length,
        stop: entry.stop
      }))
    )
    .sort((left, right) => {
      if (preference === 'first') {
        return left.index - right.index || right.aliasLength - left.aliasLength;
      }

      return right.index - left.index || right.aliasLength - left.aliasLength;
    });

  return matches[0]?.stop ?? null;
};

const detectFareType = (normalizedTranscript: string): FareVoiceType => {
  if (/\b(regular|ordinary|full fare|walang discount|walang diskwento|buo)\b/.test(normalizedTranscript)) {
    return 'regular';
  }

  if (/\b(discount|discounted|student|senior|pwd|sc|diskwento|estudyante|studyante|may discount|may diskwento)\b/.test(normalizedTranscript)) {
    return 'discounted';
  }

  return 'either';
};

const dedupeStops = (stops: Stop[]) =>
  stops.filter((stop, index) => stops.findIndex(candidate => candidate.name === stop.name) === index);

const findOrderedStopsInTranscript = (normalizedTranscript: string, route: RouteProfile) => {
  const entries = buildStopAliasEntries(route);

  const matches = entries
    .flatMap(entry =>
      getPhraseIndexes(normalizedTranscript, entry.alias).map(index => ({
        index,
        aliasLength: entry.alias.length,
        stop: entry.stop
      }))
    )
    .sort((left, right) => left.index - right.index || right.aliasLength - left.aliasLength);

  return dedupeStops(matches.map(match => match.stop));
};

const parseNumberPhrase = (tokens: string[]): string | null => {
  const filteredTokens = tokens.filter(
    token => token !== 'and' && token !== 'na' && token !== 'ng' && token !== 'ang'
  );
  if (filteredTokens.length === 0) return null;

  const pointIndex = filteredTokens.indexOf('point');
  const integerTokens = pointIndex === -1 ? filteredTokens : filteredTokens.slice(0, pointIndex);
  const fractionTokens = pointIndex === -1 ? [] : filteredTokens.slice(pointIndex + 1);

  const integerPart = parseIntegerTokens(integerTokens.length > 0 ? integerTokens : ['zero']);
  if (!integerPart) return null;

  if (pointIndex === -1) return integerPart;

  const fractionPart = parseFractionTokens(fractionTokens);
  if (!fractionPart) return null;

  return `${integerPart}.${fractionPart}`;
};

const parseIntegerTokens = (tokens: string[]) => {
  if (tokens.length === 0) return '0';

  if (tokens.length === 1 && /^\d+(\.\d+)?$/.test(tokens[0])) {
    return tokens[0];
  }

  if (tokens.every(token => token in DIGIT_WORDS || /^\d$/.test(token))) {
    return tokens
      .map(token => (token in DIGIT_WORDS ? DIGIT_WORDS[token] : token))
      .join('');
  }

  let total = 0;
  let current = 0;
  let hasValue = false;

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      current += Number(token);
      hasValue = true;
      continue;
    }

    if (token in SMALL_NUMBER_WORDS) {
      current += SMALL_NUMBER_WORDS[token];
      hasValue = true;
      continue;
    }

    if (token in TENS_NUMBER_WORDS) {
      current += TENS_NUMBER_WORDS[token];
      hasValue = true;
      continue;
    }

    if (token === 'hundred' || token === 'daan') {
      current = (current || 1) * 100;
      hasValue = true;
      continue;
    }

    if (token === 'thousand' || token === 'libo') {
      total += (current || 1) * 1000;
      current = 0;
      hasValue = true;
      continue;
    }

    return null;
  }

  if (!hasValue) return null;
  return String(total + current);
};

const parseFractionTokens = (tokens: string[]) => {
  if (tokens.length === 0) return null;

  if (tokens.every(token => token in DIGIT_WORDS || /^\d$/.test(token))) {
    return tokens
      .map(token => (token in DIGIT_WORDS ? DIGIT_WORDS[token] : token))
      .join('');
  }

  if (tokens.length === 1) {
    if (/^\d+$/.test(tokens[0])) return tokens[0];
    if (tokens[0] in SMALL_NUMBER_WORDS) return String(SMALL_NUMBER_WORDS[tokens[0]]);
    if (tokens[0] in TENS_NUMBER_WORDS) return String(TENS_NUMBER_WORDS[tokens[0]]);
  }

  const parsed = parseIntegerTokens(tokens);
  return parsed ? parsed.replace(/^0+/, '') || '0' : null;
};

const BATCH_COUNT_IGNORED_TOKENS = new Set([
  'there',
  'is',
  'are',
  'mayroong',
  'merong',
  'meron',
  'may',
  'with',
  'worth',
  'each',
  'passenger',
  'passengers',
  'ticket',
  'tickets',
  'piece',
  'pieces',
  'pcs',
  'tao',
  'pax',
  'fare',
  'fares',
  'amount',
  'batch',
  'please',
  'po',
  'lang',
  'peso',
  'pesos'
]);

const parseBatchNumberSegment = (segment: string) => {
  const parsed = parseNumberPhrase(
    segment
      .split(' ')
      .filter(Boolean)
      .filter(token => !BATCH_COUNT_IGNORED_TOKENS.has(token))
  );

  return parsed ? Number(parsed) : null;
};

export const getSpeechRecognitionCtor = (): BrowserSpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

export const extractRecognitionTranscript = (event: SpeechRecognitionEventLike) => {
  const finalParts: string[] = [];
  let latestInterim = '';
  let latestConfidence: number | null = null;
  let hasFinal = false;

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const alternative = result?.[0];
    const transcript = alternative?.transcript?.trim();

    if (!transcript) {
      continue;
    }

    if (typeof alternative?.confidence === 'number') {
      latestConfidence = alternative.confidence;
    }

    if (result.isFinal) {
      hasFinal = true;
      finalParts.push(transcript);
    } else {
      latestInterim = transcript;
    }
  }

  const transcript = [...finalParts, latestInterim].filter(Boolean).join(' ').trim();

  return {
    transcript,
    confidence: latestConfidence,
    hasFinal
  };
};

export const getVoiceConfidenceTone = (confidence: number | null): VoiceConfidenceTone => {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 'unknown';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
};

export const formatVoiceConfidence = (confidence: number | null) => {
  const tone = getVoiceConfidenceTone(confidence);

  switch (tone) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Needs confirmation';
    default:
      return 'Confidence unavailable';
  }
};

export const getSpeechRecognitionErrorMessage = (errorCode?: string) => {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked. Allow microphone access in Chrome, then try again.';
    case 'audio-capture':
      return 'No microphone was found for voice command.';
    case 'network':
      return 'Voice recognition needs a stable internet connection right now.';
    case 'no-speech':
      return 'No speech was heard. Tap the mic and speak clearly.';
    case 'aborted':
      return 'Voice listening was stopped.';
    default:
      return 'Voice recognition could not finish. Please try again.';
  }
};

export const canUseSpeechSynthesis = () =>
  typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

export const cancelVoiceReply = () => {
  if (!canUseSpeechSynthesis()) return;
  window.speechSynthesis.cancel();
};

export const speakVoiceReply = (
  message: string,
  options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    onEnd?: () => void;
    onError?: () => void;
  }
) => {
  if (!message.trim() || !canUseSpeechSynthesis()) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = options?.lang ?? 'en-PH';
    utterance.rate = options?.rate ?? 1.14;
    utterance.pitch = options?.pitch ?? 1;
    utterance.volume = options?.volume ?? 1;
    utterance.onend = () => options?.onEnd?.();
    utterance.onerror = () => options?.onError?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
};

export const parseFareTypeVoiceAnswer = (transcript: string): FareTypeVoiceAnswer | null => {
  const normalized = normalizeStopText(transcript);
  if (!normalized) return null;

  if (/\b(regular|ordinary|full fare|walang discount|walang diskwento|buo)\b/.test(normalized)) {
    return 'regular';
  }

  if (/\b(discount|discounted|student|senior|pwd|sc|diskwento|estudyante|studyante|may discount|may diskwento)\b/.test(normalized)) {
    return 'discounted';
  }

  return null;
};

export const parseVoiceBinaryAnswer = (transcript: string): VoiceBinaryAnswer | null => {
  const normalized = normalizeStopText(transcript);
  if (!normalized) return null;

  if (/\b(yes|yeah|yep|continue|next|next passenger|another|again|go on|more|oo|opo|sige|tuloy|sunod|susunod|pwede na)\b/.test(normalized)) {
    return 'yes';
  }

  if (/\b(no|nope|exit|stop|close|finish|done|cancel|end|hindi|wag|tama na|ayaw|labas|stop na)\b/.test(normalized)) {
    return 'no';
  }

  return null;
};

export const parseFareConversationShortcut = (transcript: string): FareConversationShortcut | null => {
  const normalized = normalizeStopText(transcript);
  if (!normalized) return null;

  const fareType = parseFareTypeVoiceAnswer(normalized);

  if (/\b(same cash|same money|same amount|same payment|same pera|same bayad|parehong pera|parehong bayad|parehas na amount)\b/.test(normalized)) {
    return {
      command: 'same-cash'
    };
  }

  if (/\b(new route|different route|new trip|different trip|new pickup|new destination|change route|bagong route|ibang route|iba route|bagong biyahe)\b/.test(normalized)) {
    return {
      command: 'new-route'
    };
  }

  if (
    /\b(same route|same trip|same fare|same one|same passenger|same destination|repeat route|repeat that|same again|pareho route|parehong route|ulit route|same lang|same na lang)\b/.test(normalized) ||
    ((/\b(again|repeat|same)\b/.test(normalized) || fareType !== null) && !/\bto\b/.test(normalized))
  ) {
    return {
      command: 'same-route',
      fareType
    };
  }

  return null;
};

export const parseFareVoiceTranscript = (
  transcript: string,
  route: RouteProfile
): FareVoiceParseResult => {
  const normalized = normalizeStopText(transcript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Tap the mic and say something like "Bayambang to Baguio discounted".'
    };
  }

  const fareType = detectFareType(normalized);
  const stopAliases = buildStopAliasEntries(route);
  const toMatch = /\bto\b/.exec(normalized);

  let originStop: Stop | null = null;
  let destinationStop: Stop | null = null;

  if (toMatch?.index !== undefined) {
    const before = normalized.slice(0, toMatch.index).replace(/\bfrom\b/g, ' ').trim();
    const after = normalized.slice(toMatch.index + toMatch[0].length).trim();
    originStop = pickStopFromSegment(before, stopAliases, 'last');
    destinationStop = pickStopFromSegment(after, stopAliases, 'first');
  } else {
    const orderedStops = findOrderedStopsInTranscript(normalized, route);
    [originStop, destinationStop] = orderedStops;
  }

  if (!originStop || !destinationStop) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: `I couldn't match both stops on ${route.shortLabel}. Try saying "${route.stops[0]?.name ?? 'Origin'} to ${route.stops[route.stops.length - 1]?.name ?? 'Destination'} discounted".`
    };
  }

  if (originStop.name === destinationStop.name) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I heard the same stop for pickup and destination. Please say two different stops.'
    };
  }

  const distance = Math.abs(destinationStop.km - originStop.km);
  if (distance <= 0) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'That route distance is zero. Please try again with a different stop pair.'
    };
  }

  const fare = calculateFare(distance, route.fare);

  return {
    status: 'match',
    transcript,
    normalized,
    fareType,
    originStop,
    destinationStop,
    distance,
    regularFare: fare.reg,
    discountedFare: fare.disc
  };
};

export const parseStopVoiceTranscript = (
  transcript: string,
  route: RouteProfile
): StopVoiceParseResult => {
  const normalized = normalizeStopVoiceText(transcript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Try saying a stop name like "Bayambang" or "Baguio".'
    };
  }

  const orderedStops = findOrderedStopsInTranscript(normalized, route);
  const stop = orderedStops[0] ?? null;

  if (!stop) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: `I couldn't match a stop on ${route.shortLabel}. Try saying the stop name again.`
    };
  }

  return {
    status: 'match',
    transcript,
    normalized,
    stop
  };
};

export const parseTallyNavigationVoiceTranscript = (
  transcript: string
): TallyNavigationVoiceParseResult => {
  const normalized = cleanWhitespace(
    transcript
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
  );

  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Try saying next box, previous box, next block, standard, batch, or finalize session.'
    };
  }

  const checks: Array<{
    pattern: RegExp;
    command: TallyNavigationCommand;
    label: string;
    requiresConfirmation: boolean;
  }> = [
    { pattern: /\b(previous|prev|back)\s+(box|slot)\b|\bgo back\b/, command: 'previous-box', label: 'Previous Box', requiresConfirmation: false },
    { pattern: /\bnext\s+(box|slot)\b/, command: 'next-box', label: 'Next Box', requiresConfirmation: false },
    { pattern: /\bnext\s+block\b|\bmove to next block\b|\bgo to next block\b/, command: 'next-block', label: 'Next Block', requiresConfirmation: true },
    { pattern: /\bstandard\b/, command: 'standard-mode', label: 'Standard', requiresConfirmation: false },
    { pattern: /\bbatch\b/, command: 'batch-mode', label: 'Batch', requiresConfirmation: false },
    { pattern: /\b(open|show|use)\s+(calculator|calc)\b|\bcalculator\b/, command: 'open-calculator', label: 'Open Calculator', requiresConfirmation: false },
    { pattern: /\bfinali[sz]e\b|\bsave and finali[sz]e\b/, command: 'finalize-session', label: 'Finalize Session', requiresConfirmation: true }
  ];

  const matched = checks.find(entry => entry.pattern.test(normalized));
  if (!matched) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I heard your voice, but not a safe tally command. Try next box, previous box, next block, standard, batch, or finalize session.'
    };
  }

  return {
    status: 'match',
    transcript,
    normalized,
    command: matched.command,
    label: matched.label,
    requiresConfirmation: matched.requiresConfirmation
  };
};

export const parseBatchCountVoiceTranscript = (
  transcript: string,
  availableFares: number[] = []
): BatchCountVoiceParseResult => {
  const normalized = normalizeBatchCountVoiceText(transcript);

  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Try saying "10 na 16 pesos" or "10 passengers 16 pesos".'
    };
  }

  let quantity: number | null = null;
  let fare: number | null = null;

  const quantityFirstMatch = normalized.match(
    /^(.+?)\b(?:passengers?|tickets?|pieces|pcs|tao)\b\s*(.+)$/
  );
  if (quantityFirstMatch) {
    quantity = parseBatchNumberSegment(quantityFirstMatch[1]);
    fare = parseBatchNumberSegment(quantityFirstMatch[2]);
  }

  if (quantity === null || fare === null) {
    const taggedSeparatorMatch = normalized.match(/^(.+?)\b(?:na|ng|of|for|at|times|x)\b\s*(.+)$/);
    if (taggedSeparatorMatch) {
      quantity = parseBatchNumberSegment(taggedSeparatorMatch[1]);
      fare = parseBatchNumberSegment(taggedSeparatorMatch[2]);
    }
  }

  if (quantity === null || fare === null) {
    const fareFirstMatch = normalized.match(/^(.+?)\bpesos?\b\s*(.+)$/);
    if (fareFirstMatch) {
      const firstValue = parseBatchNumberSegment(fareFirstMatch[1]);
      const secondValue = parseBatchNumberSegment(fareFirstMatch[2]);
      if (firstValue !== null && secondValue !== null) {
        fare = firstValue;
        quantity = secondValue;
      }
    }
  }

  if (quantity === null || fare === null) {
    const numericValues = (normalized.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
    if (numericValues.length >= 2) {
      const firstValue = numericValues[0];
      const secondValue = numericValues[1];
      const firstLooksLikeFare = availableFares.includes(Math.round(firstValue));
      const secondLooksLikeFare = availableFares.includes(Math.round(secondValue));

      if (firstLooksLikeFare && !secondLooksLikeFare) {
        fare = Math.round(firstValue);
        quantity = Math.round(secondValue);
      } else {
        quantity = Math.round(firstValue);
        fare = Math.round(secondValue);
      }
    }
  }

  if (!Number.isFinite(quantity) || !Number.isFinite(fare) || quantity === null || fare === null) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I could not hear both the passenger count and the fare. Try saying "10 na 16 pesos".'
    };
  }

  const safeQuantity = Math.max(0, Math.round(quantity));
  const safeFare = Math.max(0, Math.round(fare));

  if (safeQuantity <= 0) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'The passenger count should be greater than zero.'
    };
  }

  if (safeFare <= 0) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'The fare amount should be greater than zero.'
    };
  }

  if (availableFares.length > 0 && !availableFares.includes(safeFare)) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: `I heard ${safeQuantity} passengers at ${safeFare} pesos, but ${safeFare} is not in this batch list.`
    };
  }

  return {
    status: 'match',
    transcript,
    normalized,
    quantity: safeQuantity,
    fare: safeFare
  };
};

export const parseTallyBatchFollowUpTranscript = (
  transcript: string
): TallyBatchFollowUpVoiceParseResult => {
  const normalized = normalizeStopText(transcript);

  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Say another batch fare, say finalize, or say exit.'
    };
  }

  if (/\b(finalize|finalise|save|record|apply|enter now|save now|finalize session|save session)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'finalize-session',
      label: 'Finalize Session'
    };
  }

  if (/\b(next|another|continue|more|again|sunod|susunod|tuloy|next one|next fare)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'next-batch',
      label: 'Next Batch Fare'
    };
  }

  if (/\b(exit|stop|close|cancel|end|done|tama na|labas|stop now)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'exit',
      label: 'Exit Voice Assistant'
    };
  }

  return {
    status: 'invalid',
    transcript,
    normalized,
    message: 'Say another batch fare, say finalize to save the queued fares, or say exit.'
  };
};

export const parseCalculatorVoiceTranscript = (transcript: string): CalculatorVoiceParseResult => {
  const normalized = normalizeCalculatorText(transcript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Try saying something like "12 plus 45" or "60 times point eight".'
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const parts: string[] = [];
  let numberTokens: string[] = [];

  const flushNumber = () => {
    if (numberTokens.length === 0) return true;

    const parsedNumber = parseNumberPhrase(numberTokens);
    if (!parsedNumber) return false;
    parts.push(parsedNumber);
    numberTokens = [];
    return true;
  };

  for (const token of tokens) {
    if (OPERATOR_TOKENS.has(token)) {
      if (!flushNumber()) {
        return {
          status: 'invalid',
          transcript,
          normalized,
          message: 'I heard the math words, but I could not safely turn them into numbers.'
        };
      }

      if (parts.length === 0 || OPERATOR_TOKENS.has(parts[parts.length - 1])) {
        return {
          status: 'invalid',
          transcript,
          normalized,
          message: 'I need a number before that operator. Try saying the full expression again.'
        };
      }

      parts.push(token);
      continue;
    }

    numberTokens.push(token);
  }

  if (!flushNumber()) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I could not turn that spoken number into a calculator expression.'
    };
  }

  if (parts.length === 0 || OPERATOR_TOKENS.has(parts[parts.length - 1])) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'That expression looks incomplete. Try saying the numbers and operators again.'
    };
  }

  const expression = parts.join('');
  const prettyExpression = expression.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/-/g, ' - ');

  return {
    status: 'match',
    transcript,
    normalized,
    expression,
    prettyExpression: expression
      .replace(/\*/g, ' x ')
      .replace(/\//g, ' / ')
      .replace(/\+/g, ' + ')
      .replace(/-/g, ' - ')
  };
};

export const parseCashVoiceTranscript = (transcript: string): CashVoiceParseResult => {
  const normalized = normalizeCashText(transcript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Please say the passenger money clearly, like "one thousand pesos".'
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const spokenAmount = parseNumberPhrase(tokens);

  if (!spokenAmount) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I heard the response, but I could not safely read the passenger money amount.'
    };
  }

  const amount = Number(spokenAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'The passenger money needs to be greater than zero.'
    };
  }

  return {
    status: 'match',
    transcript,
    normalized,
    amount,
    spokenAmount
  };
};

export const parseTallyVoiceTranscript = (transcript: string): TallyVoiceParseResult => {
  const normalized = normalizeTallyVoiceText(transcript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Try saying something like "657 plus 20 plus 20" or "657 plus repeat plus repeat".'
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const entries: number[] = [];
  let currentNumberTokens: string[] = [];
  let expectValue = true;

  const flushNumber = () => {
    if (currentNumberTokens.length === 0) return true;

    const parsedNumber = parseNumberPhrase(currentNumberTokens);
    if (!parsedNumber) return false;

    entries.push(Number(parsedNumber));
    currentNumberTokens = [];
    return true;
  };

  for (const token of tokens) {
    if (token === '+') {
      if (!flushNumber() || expectValue) {
        return {
          status: 'invalid',
          transcript,
          normalized,
          message: 'I heard a plus sign before a number. Please say the full tally again.'
        };
      }

      expectValue = true;
      continue;
    }

    if (token === 'repeat') {
      if (!flushNumber()) {
        return {
          status: 'invalid',
          transcript,
          normalized,
          message: 'I could not safely read the number before the repeat command.'
        };
      }

      const lastEntry = entries[entries.length - 1];
      if (typeof lastEntry !== 'number') {
        return {
          status: 'invalid',
          transcript,
          normalized,
          message: 'Repeat only works after the first spoken number. Start with a fare amount first.'
        };
      }

      entries.push(lastEntry);
      expectValue = false;
      continue;
    }

    currentNumberTokens.push(token);
    expectValue = false;
  }

  if (!flushNumber()) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I could not turn that spoken tally into numbers.'
    };
  }

  if (entries.length === 0) {
    return {
      status: 'invalid',
      transcript,
      normalized,
      message: 'I did not hear any tally amounts. Try again with clear numbers.'
    };
  }

  const expression = entries.join(' + ');

  return {
    status: 'match',
    transcript,
    normalized,
    expression,
    prettyExpression: expression,
    entries
  };
};
