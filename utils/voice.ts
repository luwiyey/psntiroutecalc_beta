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
      explicitEquals: boolean;
      operatorCount: number;
      usesPemdas: boolean;
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
      explicitEquals: boolean;
    };

export type StopVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
      suggestions?: Stop[];
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
      suggestions?: Stop[];
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      stop: Stop;
      matchMode: 'exact' | 'fuzzy';
      suggestions?: Stop[];
    };

export type PassengerCountVoiceParseResult =
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
      passengerCount: number;
    };

export type StopReminderVoiceParseResult =
  | {
      status: 'empty';
      transcript: string;
      message: string;
      suggestions?: Stop[];
    }
  | {
      status: 'invalid';
      transcript: string;
      normalized: string;
      message: string;
      suggestions?: Stop[];
    }
  | {
      status: 'match';
      transcript: string;
      normalized: string;
      stopQuery: string;
      passengerCount: number | null;
      stop: Stop | null;
      stopMatchMode: 'exact' | 'fuzzy' | 'unknown';
      suggestions: Stop[];
    };

export type StopReminderFollowUpCommand =
  | 'next-stop'
  | 'exit'
  | 'correct-last'
  | 'undo-last'
  | 'repeat'
  | 'pause-alerts'
  | 'resume-alerts'
  | 'how-many-left'
  | 'list-passengers'
  | 'clear-all'
  | 'confirm-all';

export type StopReminderFollowUpVoiceParseResult =
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
      command: StopReminderFollowUpCommand;
      label: string;
      stopQuery?: string | null;
    };

export interface StopReminderChainItem {
  stopQuery: string;
  passengerCount: number;
  stop: Stop | null;
  stopMatchMode: 'exact' | 'fuzzy' | 'unknown';
  suggestions: Stop[];
}

export interface StopReminderChainParseResult {
  segments: string[];
  items: StopReminderChainItem[];
  unresolvedSegments: string[];
}

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

const SPEECH_FILLER_PATTERN = /\b(?:uh|um|ah|er|hmm+|mmm+)\b/gi;
const DEDUPABLE_SHORT_SPEECH_TOKENS = new Set(['to', 'from', 'and', 'then', 'na', 'ng', 'the']);

const normalizeSpeechToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const areSimilarSpeechChunks = (leftWords: string[], rightWords: string[]) => {
  const left = leftWords.map(normalizeSpeechToken).filter(Boolean);
  const right = rightWords.map(normalizeSpeechToken).filter(Boolean);

  if (!left.length || !right.length) {
    return false;
  }

  const maxLen = Math.max(left.length, right.length);
  const minLen = Math.min(left.length, right.length);
  if (maxLen - minLen > 1) {
    return false;
  }

  if (left.join(' ') === right.join(' ')) {
    return true;
  }

  let positionalMatches = 0;
  for (let index = 0; index < minLen; index += 1) {
    if (left[index] === right[index]) {
      positionalMatches += 1;
    }
  }

  if (positionalMatches / maxLen >= 0.75) {
    return true;
  }

  const overlap = left.filter(token => right.includes(token)).length;
  return overlap / maxLen >= 0.8;
};

const collapseRepeatedSpeech = (value: string) => {
  const normalized = cleanWhitespace(value.replace(SPEECH_FILLER_PATTERN, ' '));
  if (!normalized) return '';

  const words = normalized.split(' ');
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2;
    if (areSimilarSpeechChunks(words.slice(0, half), words.slice(half))) {
      return words.slice(0, half).join(' ');
    }
  }

  const nextWords: string[] = [];
  let index = 0;

  while (index < words.length) {
    let collapsedChunk = false;

    for (let size = Math.min(6, Math.floor((words.length - index) / 2)); size >= 2; size -= 1) {
      const leftWords = words.slice(index, index + size);
      const rightWords = words.slice(index + size, index + size * 2);
      if (areSimilarSpeechChunks(leftWords, rightWords)) {
        nextWords.push(...words.slice(index, index + size));
        index += size * 2;
        collapsedChunk = true;
        break;
      }
    }

    if (collapsedChunk) {
      continue;
    }

    const current = words[index];
    const previous = nextWords[nextWords.length - 1];
    if (
      previous &&
      current === previous &&
      (current.length > 3 || DEDUPABLE_SHORT_SPEECH_TOKENS.has(current))
    ) {
      index += 1;
      continue;
    }

    nextWords.push(current);
    index += 1;
  }

  return cleanWhitespace(nextWords.join(' '));
};

const normalizeStopText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bti\b/g, ' to ')
      .replace(/[()]/g, ' ')
      .replace(/[\/,.-]/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
  );

const normalizeCalculatorText = (value: string) =>
  cleanWhitespace(
    value
      .toLowerCase()
      .replace(/equals?/g, ' = ')
      .replace(/equal to/g, ' = ')
      .replace(/multiplied by/g, ' * ')
      .replace(/multiplied/g, ' * ')
      .replace(/multiply by/g, ' * ')
      .replace(/multiply/g, ' * ')
      .replace(/times/g, ' * ')
      .replace(/x/g, ' * ')
      .replace(/divided by/g, ' / ')
      .replace(/divided/g, ' / ')
      .replace(/divide by/g, ' / ')
      .replace(/divide/g, ' / ')
      .replace(/over/g, ' / ')
      .replace(/plus/g, ' + ')
      .replace(/add/g, ' + ')
      .replace(/added to/g, ' + ')
      .replace(/minus/g, ' - ')
      .replace(/subtract/g, ' - ')
      .replace(/subtracted by/g, ' - ')
      .replace(/less/g, ' - ')
      .replace(/point/g, ' point ')
      .replace(/dot/g, ' point ')
      .replace(/=/g, ' = ')
      .replace(/([+\-*/])/g, ' $1 ')
      .replace(/[^a-z0-9=+*/.\-\s]/g, ' ')
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

const STOP_REMINDER_IGNORED_TOKENS = new Set([
  'please',
  'po',
  'lang',
  'queue',
  'record',
  'add',
  'save',
  'stop',
  'drop',
  'off',
  'dropoff',
  'alert',
  'alerts',
  'passenger',
  'passengers',
  'pax',
  'tao',
  'for',
  'at',
  'the',
  'a',
  'an',
  'there',
  'is',
  'are',
  'with',
  'count'
]);

const STOP_REMINDER_COUNT_HINTS = new Set([
  'passenger',
  'passengers',
  'pax',
  'tao',
  'there',
  'is',
  'are',
  'with',
  'na',
  'ng'
]);

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

const tokenizeNormalizedText = (value: string) => value.split(' ').filter(Boolean);

const getLevenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
};

const getPhoneticKey = (value: string) => {
  const upper = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (!upper) return '';

  const first = upper[0];
  const replacements = upper
    .slice(1)
    .replace(/[AEIOUYHW]/g, '')
    .replace(/[BFPV]/g, '1')
    .replace(/[CGJKQSXZ]/g, '2')
    .replace(/[DT]/g, '3')
    .replace(/[L]/g, '4')
    .replace(/[MN]/g, '5')
    .replace(/[R]/g, '6')
    .replace(/(.)\1+/g, '$1');

  return `${first}${replacements}`.slice(0, 4).padEnd(4, '0');
};

const getTokenSimilarity = (left: string, right: string) => {
  if (left === right) return 1;
  if (!left || !right) return 0;

  if (getPhoneticKey(left) === getPhoneticKey(right)) {
    return 0.92;
  }

  const distance = getLevenshteinDistance(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
};

const findApproximateStopCandidates = (
  segment: string,
  route: RouteProfile,
  limit = 3
) => {
  const tokens = tokenizeNormalizedText(segment);
  if (tokens.length === 0) {
    return [];
  }

  const entries = buildStopAliasEntries(route);
  const candidates = entries.flatMap(entry => {
    const aliasTokens = tokenizeNormalizedText(entry.alias);
    if (aliasTokens.length === 0 || aliasTokens.length > tokens.length) {
      return [];
    }

    const entryMatches: Array<{ stop: Stop; score: number; index: number; aliasLength: number }> = [];

    for (let index = 0; index <= tokens.length - aliasTokens.length; index += 1) {
      const windowTokens = tokens.slice(index, index + aliasTokens.length);
      const similarities = aliasTokens.map((token, tokenIndex) =>
        getTokenSimilarity(token, windowTokens[tokenIndex])
      );
      const exactishCount = similarities.filter(score => score >= 0.78).length;
      const averageScore = similarities.reduce((sum, score) => sum + score, 0) / similarities.length;

      if (
        averageScore >= (aliasTokens.length === 1 ? 0.78 : 0.8) &&
        exactishCount === aliasTokens.length
      ) {
        entryMatches.push({
          stop: entry.stop,
          score: averageScore,
          index,
          aliasLength: aliasTokens.length
        });
      }
    }

    return entryMatches;
  });

  return candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.index !== right.index) {
        return left.index - right.index;
      }

      return right.aliasLength - left.aliasLength;
    })
    .filter((candidate, index, list) =>
      list.findIndex(other => other.stop.name === candidate.stop.name) === index
    )
    .slice(0, limit)
    .map(candidate => candidate.stop);
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

export const findTopStopVoiceSuggestions = (
  transcript: string,
  route: RouteProfile,
  limit = 3
) => {
  const normalized = normalizeStopText(collapseRepeatedSpeech(transcript));
  if (!normalized) {
    return [] as Stop[];
  }

  const exactMatches = findOrderedStopsInTranscript(normalized, route);
  if (exactMatches.length > 0) {
    return exactMatches.slice(0, limit);
  }

  return findApproximateStopCandidates(normalized, route, limit);
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

const isVoiceNumberToken = (token: string) =>
  /^\d+$/.test(token) ||
  token === 'point' ||
  token in DIGIT_WORDS ||
  token in SMALL_NUMBER_WORDS ||
  token in TENS_NUMBER_WORDS ||
  token === 'hundred' ||
  token === 'thousand' ||
  token === 'daan' ||
  token === 'libo';

const extractPassengerCountMatch = (tokens: string[]) => {
  let bestMatch: { start: number; end: number; passengerCount: number; score: number } | null = null;

  for (let start = 0; start < tokens.length; start += 1) {
    if (!isVoiceNumberToken(tokens[start])) {
      continue;
    }

    for (let end = start; end < Math.min(tokens.length, start + 4); end += 1) {
      const segment = tokens.slice(start, end + 1);
      if (!segment.every(isVoiceNumberToken)) {
        break;
      }

      const parsed = parseNumberPhrase(segment);
      if (!parsed) {
        continue;
      }

      const passengerCount = Math.max(0, Math.round(Number(parsed)));
      if (!Number.isFinite(passengerCount) || passengerCount <= 0) {
        continue;
      }

      const before = tokens[start - 1];
      const after = tokens[end + 1];
      const score =
        segment.length +
        (STOP_REMINDER_COUNT_HINTS.has(before ?? '') ? 2 : 0) +
        (STOP_REMINDER_COUNT_HINTS.has(after ?? '') ? 2 : 0) +
        (end >= tokens.length - 1 ? 1 : 0);

      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && end > bestMatch.end)
      ) {
        bestMatch = {
          start,
          end,
          passengerCount,
          score
        };
      }
    }
  }

  return bestMatch;
};

const buildStopReminderQuery = (
  tokens: string[],
  passengerCountMatch: ReturnType<typeof extractPassengerCountMatch>
) =>
  cleanWhitespace(
    tokens
      .filter((_, index) => {
        if (!passengerCountMatch) {
          return true;
        }

        return index < passengerCountMatch.start || index > passengerCountMatch.end;
      })
      .filter(token => !STOP_REMINDER_IGNORED_TOKENS.has(token))
      .join(' ')
  );

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

  const transcript = collapseRepeatedSpeech([...finalParts, latestInterim].filter(Boolean).join(' ').trim());

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
    utterance.rate = options?.rate ?? 1.45;
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

  if (
    /\b(discount|discounted|counted|discounting|dis counted|student|senior|pwd|sc|diskwento|estudyante|studyante|may discount|may diskwento)\b/.test(
      normalized
    )
  ) {
    return 'discounted';
  }

  return null;
};

export const parseVoiceBinaryAnswer = (transcript: string): VoiceBinaryAnswer | null => {
  const normalized = normalizeStopText(transcript);
  if (!normalized) return null;

  if (
    /\b(yes|yeah|yep|continue|next|next passenger|another|again|go on|more|oo|opo|sige|tuloy|sunod|susunod|pwede na|im done|i m done|okay done|ok done|done na|tapos na)\b/.test(
      normalized
    )
  ) {
    return 'yes';
  }

  if (/\b(no|nope|exit|stop|close|finish|done|cancel|end|hindi|wag|tama na|ayaw|labas|stop na|not yet|hindi pa)\b/.test(normalized)) {
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
    ((/\b(again|repeat|same)\b/.test(normalized) || fareType !== null) && !/\b(?:to|ti)\b/.test(normalized))
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
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeStopText(cleanedTranscript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
      message: 'Tap the mic and say something like "Bayambang to Baguio discounted".'
    };
  }

  const fareType = detectFareType(normalized);
  const stopAliases = buildStopAliasEntries(route);
  const toMatch = /\b(?:to|ti)\b/.exec(normalized);

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
        transcript: cleanedTranscript,
        normalized,
        message: `I couldn't match both stops on ${route.shortLabel}. Try saying "${route.stops[0]?.name ?? 'Origin'} to ${route.stops[route.stops.length - 1]?.name ?? 'Destination'} discounted".`
      };
  }

  if (originStop.name === destinationStop.name) {
      return {
        status: 'invalid',
        transcript: cleanedTranscript,
        normalized,
        message: 'I heard the same stop for pickup and destination. Please say two different stops.'
      };
  }

  const distance = Math.abs(destinationStop.km - originStop.km);
  if (distance <= 0) {
      return {
        status: 'invalid',
        transcript: cleanedTranscript,
        normalized,
        message: 'That route distance is zero. Please try again with a different stop pair.'
      };
  }

  const fare = calculateFare(distance, route.fare);

  return {
    status: 'match',
    transcript: cleanedTranscript,
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
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeStopVoiceText(cleanedTranscript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
      message: 'Try saying a stop name like "Bayambang" or "Baguio".',
      suggestions: []
    };
  }

  const orderedStops = findOrderedStopsInTranscript(normalized, route);
  if (orderedStops.length > 0) {
    return {
      status: 'match',
      transcript: cleanedTranscript,
      normalized,
      stop: orderedStops[0],
      matchMode: 'exact',
      suggestions: orderedStops.slice(0, 3)
    };
  }

  const approximateStops = findApproximateStopCandidates(normalized, route, 3);
  const stop = approximateStops[0] ?? null;

  if (!stop) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: `I couldn't match a stop on ${route.shortLabel}. Try saying the stop name again.`,
      suggestions: []
    };
  }

  return {
    status: 'match',
    transcript: cleanedTranscript,
    normalized,
    stop,
    matchMode: 'fuzzy',
    suggestions: approximateStops
  };
};

export const parsePassengerCountVoiceTranscript = (
  transcript: string
): PassengerCountVoiceParseResult => {
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeStopText(cleanedTranscript);

  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
      message: 'Please say the passenger count, like "2" or "two passengers".'
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const passengerCountMatch = extractPassengerCountMatch(tokens);

  if (!passengerCountMatch) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: 'I heard your voice, but not the passenger count. Please say the number again.'
    };
  }

  return {
    status: 'match',
    transcript: cleanedTranscript,
    normalized,
    passengerCount: passengerCountMatch.passengerCount
  };
};

export const parseStopReminderVoiceTranscript = (
  transcript: string,
  route: RouteProfile
): StopReminderVoiceParseResult => {
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeStopText(cleanedTranscript);

  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
      message: 'Try saying a stop and passenger count like "Anonas 2".',
      suggestions: []
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const passengerCountMatch = extractPassengerCountMatch(tokens);
  const stopQuery = buildStopReminderQuery(tokens, passengerCountMatch);

  if (!stopQuery) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: 'I heard the passenger count, but not the stop name. Please say the stop too.',
      suggestions: []
    };
  }

  const stopResult = parseStopVoiceTranscript(stopQuery, route);
  const stopSuggestions =
    stopResult.status === 'match'
      ? stopResult.suggestions ?? [stopResult.stop]
      : stopResult.suggestions ?? findTopStopVoiceSuggestions(stopQuery, route);

  return {
    status: 'match',
    transcript: cleanedTranscript,
    normalized,
    stopQuery,
    passengerCount: passengerCountMatch?.passengerCount ?? null,
    stop: stopResult.status === 'match' ? stopResult.stop : null,
    stopMatchMode:
      stopResult.status === 'match'
        ? stopResult.matchMode
        : 'unknown',
    suggestions: stopSuggestions
  };
};

export const parseStopReminderFollowUpTranscript = (
  transcript: string
): StopReminderFollowUpVoiceParseResult => {
  const normalized = normalizeStopText(transcript);

  if (!normalized) {
    return {
      status: 'empty',
      transcript,
      message: 'Say the next stop, say exit, say undo, or say wrong if you need to fix the last one.'
    };
  }

  if (/\b(wrong|sorry|mistake|mali|correction|correct that|fix that|remove that)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'correct-last',
      label: 'Correct Last Stop'
    };
  }

  if (/\b(undo|cancel last|undo last|take back|balik huli)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'undo-last',
      label: 'Undo Last Stop'
    };
  }

  if (/\b(repeat|say that again|ulit|ulitin|pakulit)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'repeat',
      label: 'Repeat Voice Prompt'
    };
  }

  if (/\b(pause alerts|pause alert|alerts off|alert off|stop alerts)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'pause-alerts',
      label: 'Pause Alerts'
    };
  }

  if (/\b(resume alerts|alerts on|turn alerts on|resume alert)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'resume-alerts',
      label: 'Resume Alerts'
    };
  }

  if (/\b(how many left|how many pa|ilan pa|how many remaining|remaining reminders)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'how-many-left',
      label: 'How Many Left'
    };
  }

  if (/\b(list passengers|list reminders|list stops|what are the stops|ano mga stop)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'list-passengers',
      label: 'List Passengers'
    };
  }

  if (/\b(clear all|remove all|delete all)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'clear-all',
      label: 'Clear All Stops'
    };
  }

  if (/\b(confirm all|turn all on|enable all)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'confirm-all',
      label: 'Confirm All Stops'
    };
  }

  if (/\b(next|another|continue|more|again|sunod|susunod|tuloy|next stop|skip)\b/.test(normalized)) {
    return {
      status: 'match',
      transcript,
      normalized,
      command: 'next-stop',
      label: 'Next Stop'
    };
  }

  if (/\b(exit|stop|close|cancel|done|finish|tama na|labas|end)\b/.test(normalized)) {
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
    message: 'Say the next stop, say exit, say undo, or say wrong if you need to fix the last one.'
  };
};

export const parseStopReminderVoiceChainDetailed = (
  transcript: string,
  route: RouteProfile
): StopReminderChainParseResult => {
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  if (!cleanedTranscript.trim()) {
    return {
      segments: [],
      items: [],
      unresolvedSegments: []
    };
  }

  const segments = cleanedTranscript
    .split(/\s*(?:,| then | tapos | saka | and then )\s*/i)
    .map(segment => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return {
      segments,
      items: [],
      unresolvedSegments: []
    };
  }

  const parsedSegments = segments.map(segment => ({
    segment,
    result: parseStopReminderVoiceTranscript(segment, route)
  }));

  const items: StopReminderChainItem[] = [];
  const unresolvedSegments: string[] = [];

  parsedSegments.forEach(({ segment, result }) => {
    if (result.status === 'match' && typeof result.passengerCount === 'number' && result.passengerCount > 0) {
      items.push({
        stopQuery: result.stopQuery,
        passengerCount: result.passengerCount ?? 0,
        stop: result.stop,
        stopMatchMode: result.stopMatchMode,
        suggestions: result.suggestions
      });
      return;
    }

    unresolvedSegments.push(segment);
  });

  return {
    segments,
    items,
    unresolvedSegments
  };
};

export const parseStopReminderVoiceChain = (
  transcript: string,
  route: RouteProfile
): StopReminderChainItem[] => parseStopReminderVoiceChainDetailed(transcript, route).items;

export const parseTallyNavigationVoiceTranscript = (
  transcript: string
): TallyNavigationVoiceParseResult => {
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = cleanWhitespace(
    cleanedTranscript
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
  );

  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
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
      transcript: cleanedTranscript,
      normalized,
      message: 'I heard your voice, but not a safe tally command. Try next box, previous box, next block, standard, batch, or finalize session.'
    };
  }

  return {
    status: 'match',
    transcript: cleanedTranscript,
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
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeCalculatorText(cleanedTranscript);
  const explicitEquals = /\bequals?\b|=/.test(cleanedTranscript.toLowerCase());
  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
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
    if (token === '=') {
      break;
    }

    if (OPERATOR_TOKENS.has(token)) {
      if (!flushNumber()) {
        return {
          status: 'invalid',
          transcript: cleanedTranscript,
          normalized,
          message: 'I heard the math words, but I could not safely turn them into numbers.'
        };
      }

      if (parts.length === 0 || OPERATOR_TOKENS.has(parts[parts.length - 1])) {
        return {
          status: 'invalid',
          transcript: cleanedTranscript,
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
      transcript: cleanedTranscript,
      normalized,
      message: 'I could not turn that spoken number into a calculator expression.'
    };
  }

  if (parts.length === 0 || OPERATOR_TOKENS.has(parts[parts.length - 1])) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: 'That expression looks incomplete. Try saying the numbers and operators again.'
    };
  }

  const expression = parts.join('');
  const operatorCount = (expression.match(/[+\-*/]/g) ?? []).length;
  const usesPemdas =
    operatorCount > 1 &&
    (expression.includes('*') || expression.includes('/')) &&
    (expression.includes('+') || expression.includes('-'));
  const prettyExpression = expression.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/-/g, ' - ');

  return {
    status: 'match',
    transcript: cleanedTranscript,
    normalized,
    expression,
    prettyExpression: expression
      .replace(/\*/g, ' x ')
      .replace(/\//g, ' / ')
      .replace(/\+/g, ' + ')
      .replace(/-/g, ' - '),
    explicitEquals,
    operatorCount,
    usesPemdas
  };
};

export const parseCashVoiceTranscript = (transcript: string): CashVoiceParseResult => {
  const cleanedTranscript = collapseRepeatedSpeech(transcript);
  const normalized = normalizeCashText(cleanedTranscript);
  if (!normalized) {
    return {
      status: 'empty',
      transcript: cleanedTranscript,
      message: 'Please say the passenger money clearly, like "one thousand pesos".'
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const spokenAmount = parseNumberPhrase(tokens);

  if (!spokenAmount) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: 'I heard the response, but I could not safely read the passenger money amount.'
    };
  }

  const amount = Number(spokenAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: 'invalid',
      transcript: cleanedTranscript,
      normalized,
      message: 'The passenger money needs to be greater than zero.'
    };
  }

  return {
    status: 'match',
    transcript: cleanedTranscript,
    normalized,
    amount,
    spokenAmount
  };
};

export const parseTallyVoiceTranscript = (transcript: string): TallyVoiceParseResult => {
  const explicitEquals = /\bequals?\b|=/.test(transcript.toLowerCase());
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
    entries,
    explicitEquals
  };
};
