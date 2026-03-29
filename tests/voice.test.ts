import { describe, expect, it } from 'vitest';
import { CUBAO_BAGUIO_ROUTE_ID, ROUTES } from '../constants';
import {
  getSpeechRecognitionErrorMessage,
  parseBatchCountVoiceTranscript,
  parseCashVoiceTranscript,
  parseCalculatorVoiceTranscript,
  parseFareConversationShortcut,
  parseFareTypeVoiceAnswer,
  parseFareVoiceTranscript,
  parseStopVoiceTranscript,
  parseTallyBatchFollowUpTranscript,
  parseVoiceBinaryAnswer,
  parseTallyNavigationVoiceTranscript
} from '../utils/voice';

const cubaoBaguioRoute = ROUTES.find(route => route.id === CUBAO_BAGUIO_ROUTE_ID);

if (!cubaoBaguioRoute) {
  throw new Error('Cubao-Baguio route not found for voice tests.');
}

describe('parseFareVoiceTranscript', () => {
  it('matches Cubao to Dau as a regular fare query', () => {
    const result = parseFareVoiceTranscript('Cubao to Dau regular', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result.');
    }

    expect(result.originStop.name).toBe('Cubao');
    expect(result.destinationStop.name).toBe('Dau');
    expect(result.fareType).toBe('regular');
    expect(result.distance).toBe(94);
    expect(result.regularFare).toBe(254);
    expect(result.discountedFare).toBe(203);
  });

  it('rejects the same stop for origin and destination', () => {
    const result = parseFareVoiceTranscript('Cubao to Cubao regular', cubaoBaguioRoute);

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') {
      throw new Error('Expected an invalid fare result.');
    }

    expect(result.message).toContain('same stop');
  });

  it('collapses repeated fare phrases from speech recognition', () => {
    const result = parseFareVoiceTranscript('Cubao to Dau regular Cubao to Dau regular', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result after collapsing repetition.');
    }

    expect(result.originStop.name).toBe('Cubao');
    expect(result.destinationStop.name).toBe('Dau');
    expect(result.fareType).toBe('regular');
  });
});

describe('parseCalculatorVoiceTranscript', () => {
  it('turns spoken addition into an expression', () => {
    const result = parseCalculatorVoiceTranscript('12 plus 45');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result.');
    }

    expect(result.expression).toBe('12+45');
    expect(result.prettyExpression).toBe('12 + 45');
  });

  it('turns decimal multiplication into an expression', () => {
    const result = parseCalculatorVoiceTranscript('60 times point eight');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result.');
    }

    expect(result.expression).toBe('60*0.8');
    expect(result.prettyExpression).toBe('60 x 0.8');
  });

  it('accepts compact calculator phrases with an equals ending', () => {
    const result = parseCalculatorVoiceTranscript('75+67=');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result with equals.');
    }

    expect(result.expression).toBe('75+67');
    expect(result.prettyExpression).toBe('75 + 67');
  });

  it('returns empty when the transcript has no usable content', () => {
    const result = parseCalculatorVoiceTranscript('');

    expect(result.status).toBe('empty');
  });
});

describe('parseFareTypeVoiceAnswer', () => {
  it('matches discounted follow-up answers', () => {
    expect(parseFareTypeVoiceAnswer('discounted please')).toBe('discounted');
  });

  it('matches Taglish discounted follow-up answers', () => {
    expect(parseFareTypeVoiceAnswer('may discount po')).toBe('discounted');
  });

  it('matches regular follow-up answers', () => {
    expect(parseFareTypeVoiceAnswer('regular fare')).toBe('regular');
  });

  it('matches Taglish regular follow-up answers', () => {
    expect(parseFareTypeVoiceAnswer('walang discount')).toBe('regular');
  });
});

describe('parseFareConversationShortcut', () => {
  it('matches same route with discounted override', () => {
    const result = parseFareConversationShortcut('same route discounted again');

    expect(result).toEqual({
      command: 'same-route',
      fareType: 'discounted'
    });
  });

  it('matches same cash shortcut', () => {
    const result = parseFareConversationShortcut('same amount');

    expect(result).toEqual({
      command: 'same-cash'
    });
  });

  it('matches new route shortcut', () => {
    const result = parseFareConversationShortcut('new route');

    expect(result).toEqual({
      command: 'new-route'
    });
  });

  it('matches Taglish same-cash shortcut', () => {
    const result = parseFareConversationShortcut('parehong bayad');

    expect(result).toEqual({
      command: 'same-cash'
    });
  });

  it('matches Taglish same-route shortcut', () => {
    const result = parseFareConversationShortcut('pareho route');

    expect(result).toEqual({
      command: 'same-route',
      fareType: null
    });
  });
});

describe('parseCashVoiceTranscript', () => {
  it('reads spoken passenger money amounts', () => {
    const result = parseCashVoiceTranscript('their money is one thousand pesos');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched cash result.');
    }

    expect(result.amount).toBe(1000);
  });

  it('reads Taglish passenger money amounts', () => {
    const result = parseCashVoiceTranscript('isang libo ang bayad');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched Taglish cash result.');
    }

    expect(result.amount).toBe(1000);
  });

  it('rejects non-numeric follow-up answers', () => {
    const result = parseCashVoiceTranscript('maybe later');

    expect(result.status).toBe('invalid');
  });
});

describe('parseVoiceBinaryAnswer', () => {
  it('matches Taglish yes responses', () => {
    expect(parseVoiceBinaryAnswer('oo susunod')).toBe('yes');
  });

  it('matches Taglish no responses', () => {
    expect(parseVoiceBinaryAnswer('hindi exit')).toBe('no');
  });
});

describe('parseStopVoiceTranscript', () => {
  it('matches a spoken stop name for picker confirmation', () => {
    const result = parseStopVoiceTranscript('set destination to Dau', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop result.');
    }

    expect(result.stop.name).toBe('Dau');
  });
});

describe('parseTallyNavigationVoiceTranscript', () => {
  it('matches next block as a confirmation-required action', () => {
    const result = parseTallyNavigationVoiceTranscript('next block');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched tally command.');
    }

    expect(result.command).toBe('next-block');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('matches standard mode as an immediate safe action', () => {
    const result = parseTallyNavigationVoiceTranscript('switch to standard mode');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched tally command.');
    }

    expect(result.command).toBe('standard-mode');
    expect(result.requiresConfirmation).toBe(false);
  });
});

describe('parseBatchCountVoiceTranscript', () => {
  it('reads Taglish quantity plus fare phrases for batch mode', () => {
    const result = parseBatchCountVoiceTranscript('mayroong 10 na 16 pesos', [16, 20, 22, 24]);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched batch voice result.');
    }

    expect(result.quantity).toBe(10);
    expect(result.fare).toBe(16);
  });

  it('reads numeric English phrases and uses the visible batch fare list to infer the fare', () => {
    const result = parseBatchCountVoiceTranscript('there are 10 16 pesos', [16, 20, 22, 24]);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched batch voice result.');
    }

    expect(result.quantity).toBe(10);
    expect(result.fare).toBe(16);
  });

  it('rejects a fare that is not visible in the current batch list', () => {
    const result = parseBatchCountVoiceTranscript('10 na 17 pesos', [16, 20, 22, 24]);

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') {
      throw new Error('Expected an invalid batch voice result.');
    }

    expect(result.message).toContain('not in this batch list');
  });
});

describe('parseTallyBatchFollowUpTranscript', () => {
  it('treats next as a continue command', () => {
    const result = parseTallyBatchFollowUpTranscript('next');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched batch follow-up result.');
    }

    expect(result.command).toBe('next-batch');
  });

  it('matches finalize as a follow-up save command', () => {
    const result = parseTallyBatchFollowUpTranscript('finalize');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched batch follow-up result.');
    }

    expect(result.command).toBe('finalize-session');
  });
});

describe('getSpeechRecognitionErrorMessage', () => {
  it('uses a permission-specific message for blocked microphone access', () => {
    expect(getSpeechRecognitionErrorMessage('not-allowed')).toContain('blocked');
  });

  it('falls back to a generic retry message for unknown errors', () => {
    expect(getSpeechRecognitionErrorMessage('unexpected')).toContain('try again');
  });
});
