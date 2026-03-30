import { describe, expect, it } from 'vitest';
import { CUBAO_BAGUIO_ROUTE_ID, ORDINARY_BAYAMBANG_ROUTE_ID, ROUTES } from '../constants';
import {
  extractRecognitionTranscript,
  getSpeechRecognitionErrorMessage,
  parseBatchCountVoiceTranscript,
  parseCashVoiceTranscript,
  parseCalculatorVoiceTranscript,
  parseFareConversationShortcut,
  parseFareTypeVoiceAnswer,
  parseFareVoiceTranscript,
  parsePassengerCountVoiceTranscript,
  parseStopReminderVoiceChain,
  parseStopReminderVoiceChainDetailed,
  parseStopReminderFollowUpTranscript,
  parseShiftVoiceCommand,
  parseStopReminderVoiceTranscript,
  parseStopVoiceTranscript,
  parseTallyBatchFollowUpTranscript,
  parseVoiceBinaryAnswer,
  parseTallyNavigationVoiceTranscript
} from '../utils/voice';

const cubaoBaguioRoute = ROUTES.find(route => route.id === CUBAO_BAGUIO_ROUTE_ID);
const ordinaryBayambangRoute = ROUTES.find(route => route.id === ORDINARY_BAYAMBANG_ROUTE_ID);

if (!cubaoBaguioRoute) {
  throw new Error('Cubao-Baguio route not found for voice tests.');
}

if (!ordinaryBayambangRoute) {
  throw new Error('Ordinary Bayambang route not found for voice tests.');
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
    expect(result.regularFare).toBe(221);
    expect(result.discountedFare).toBe(177);
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

  it('collapses near-duplicate fare phrases with minor speech variation', () => {
    const result = parseFareVoiceTranscript('Cubao to Dau regular Cubao to Dow regular', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result after fuzzy repetition cleanup.');
    }

    expect(result.originStop.name).toBe('Cubao');
    expect(result.destinationStop.name).toBe('Dau');
    expect(result.fareType).toBe('regular');
  });

  it('ignores filler words and repeated connector words from noisy recognition', () => {
    const result = parseFareVoiceTranscript('uh Cubao to to Dau regular', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result from noisy speech.');
    }

    expect(result.originStop.name).toBe('Cubao');
    expect(result.destinationStop.name).toBe('Dau');
    expect(result.fareType).toBe('regular');
  });

  it('accepts ti as a route connector from noisy speech recognition', () => {
    const result = parseFareVoiceTranscript('Cubao ti Dau regular', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result using ti as the connector.');
    }

    expect(result.originStop.name).toBe('Cubao');
    expect(result.destinationStop.name).toBe('Dau');
  });

  it('uses fuzzy stop matching inside a route phrase for noisy pronunciations', () => {
    const result = parseFareVoiceTranscript('Saytan to Urdeneta regular', ordinaryBayambangRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result from fuzzy stop phrases.');
    }

    expect(result.originStop.name).toContain('Saitan');
    expect(result.destinationStop.name).toContain('Urdaneta');
    expect(result.fareType).toBe('regular');
  });

  it('collapses rolling partial stop fragments from browser speech', () => {
    const result = parseFareVoiceTranscript('Rosario Rosario Rosari to Urdaneta', ordinaryBayambangRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched fare result after rolling fragment cleanup.');
    }

    expect(result.originStop.name).toContain('Rosario');
    expect(result.destinationStop.name).toContain('Urdaneta');
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
    expect(result.explicitEquals).toBe(false);
    expect(result.operatorCount).toBe(1);
    expect(result.usesPemdas).toBe(false);
  });

  it('turns decimal multiplication into an expression', () => {
    const result = parseCalculatorVoiceTranscript('60 times point eight');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result.');
    }

    expect(result.expression).toBe('60*0.8');
    expect(result.prettyExpression).toBe('60 x 0.8');
    expect(result.explicitEquals).toBe(false);
    expect(result.operatorCount).toBe(1);
  });

  it('accepts compact calculator phrases with an equals ending', () => {
    const result = parseCalculatorVoiceTranscript('75+67=');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result with equals.');
    }

    expect(result.expression).toBe('75+67');
    expect(result.prettyExpression).toBe('75 + 67');
    expect(result.explicitEquals).toBe(true);
  });

  it('flags mixed operators so calculators can explain pemdas', () => {
    const result = parseCalculatorVoiceTranscript('10 plus 5 times 2');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched calculator result with mixed operators.');
    }

    expect(result.expression).toBe('10+5*2');
    expect(result.operatorCount).toBe(2);
    expect(result.usesPemdas).toBe(true);
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

  it('treats counted as a noisy discounted answer', () => {
    expect(parseFareTypeVoiceAnswer('counted')).toBe('discounted');
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

  it('matches short yes responses that browsers often return in noise', () => {
    expect(parseVoiceBinaryAnswer('ya tama')).toBe('yes');
  });

  it('matches Taglish no responses', () => {
    expect(parseVoiceBinaryAnswer('hindi exit')).toBe('no');
  });

  it('treats im done as a yes response for follow-up questions', () => {
    expect(parseVoiceBinaryAnswer('im done')).toBe('yes');
  });

  it('treats confirm-style answers as yes', () => {
    expect(parseVoiceBinaryAnswer('confirm')).toBe('yes');
    expect(parseVoiceBinaryAnswer('sure proceed')).toBe('yes');
  });

  it('treats shut up as a stop answer', () => {
    expect(parseVoiceBinaryAnswer('shut up')).toBe('no');
  });
});

describe('extractRecognitionTranscript', () => {
  it('uses resultIndex so old final chunks are not re-added on every event', () => {
    const event = {
      resultIndex: 1,
      results: [
        {
          isFinal: true,
          length: 1,
          0: { transcript: 'Bayambang to', confidence: 0.91 }
        },
        {
          isFinal: true,
          length: 1,
          0: { transcript: 'Baguio discounted', confidence: 0.88 }
        }
      ]
    };

    const result = extractRecognitionTranscript(event);

    expect(result.finalTranscript).toBe('Baguio discounted');
    expect(result.transcript).toBe('Baguio discounted');
    expect(result.hasFinal).toBe(true);
  });
});

describe('parseShiftVoiceCommand', () => {
  it('matches manual start shift phrases', () => {
    const result = parseShiftVoiceCommand('start shift');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched shift command.');
    }

    expect(result.command).toBe('start-shift');
  });

  it('matches manual end shift phrases', () => {
    const result = parseShiftVoiceCommand('end session');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched shift command.');
    }

    expect(result.command).toBe('end-shift');
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

  it('uses fuzzy stop matching for slight speech variations', () => {
    const result = parseStopVoiceTranscript('Rosaryo', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a fuzzy matched stop result.');
    }

    expect(result.stop.name).toBe('Rosario');
    expect(result.matchMode).toBe('fuzzy');
  });

  it('recognizes common pronunciation variants for route stops', () => {
    const result = parseStopVoiceTranscript('Saytan', ordinaryBayambangRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a fuzzy matched stop result for Saytan.');
    }

    expect(result.stop.name).toContain('Saitan');
    expect(['exact', 'fuzzy']).toContain(result.matchMode);
  });
});

describe('parseStopReminderVoiceTranscript', () => {
  it('matches stop plus passenger count in one phrase', () => {
    const result = parseStopReminderVoiceTranscript('Dau 2', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop reminder result.');
    }

    expect(result.stop?.name).toBe('Dau');
    expect(result.passengerCount).toBe(2);
  });

  it('keeps the stop query even when the passenger count is missing', () => {
    const result = parseStopReminderVoiceTranscript('Dau', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop reminder result.');
    }

    expect(result.stop?.name).toBe('Dau');
    expect(result.passengerCount).toBeNull();
  });

  it('returns suggestion candidates for rough stop spellings', () => {
    const result = parseStopReminderVoiceTranscript('Rosaryo 2', cubaoBaguioRoute);

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop reminder result with suggestions.');
    }

    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

describe('parseStopReminderVoiceChain', () => {
  it('splits chained stop reminders joined by commas', () => {
    const result = parseStopReminderVoiceChain('Dau 1, Rosario 2', cubaoBaguioRoute);

    expect(result).toHaveLength(2);
    expect(result[0].passengerCount).toBe(1);
    expect(result[1].passengerCount).toBe(2);
  });

  it('reports unresolved chained segments instead of silently dropping them', () => {
    const result = parseStopReminderVoiceChainDetailed('Dau 1, Rosario', cubaoBaguioRoute);

    expect(result.segments).toHaveLength(2);
    expect(result.items).toHaveLength(1);
    expect(result.unresolvedSegments).toEqual(['Rosario']);
  });
});

describe('parsePassengerCountVoiceTranscript', () => {
  it('reads passenger count follow-up answers', () => {
    const result = parsePassengerCountVoiceTranscript('two passengers');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched passenger count result.');
    }

    expect(result.passengerCount).toBe(2);
  });

  it('treats to and too as two for noisy passenger-count replies', () => {
    expect(parsePassengerCountVoiceTranscript('to').status).toBe('match');
    const result = parsePassengerCountVoiceTranscript('too');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched noisy passenger count result.');
    }

    expect(result.passengerCount).toBe(2);
  });

  it('treats couple as two for passenger-count replies', () => {
    const result = parsePassengerCountVoiceTranscript('couple');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched couple passenger count result.');
    }

    expect(result.passengerCount).toBe(2);
  });

  it('handles noisy one, two, and three variants for passenger-count replies', () => {
    const oneResult = parsePassengerCountVoiceTranscript('wan');
    const twoResult = parsePassengerCountVoiceTranscript('tu');
    const threeResult = parsePassengerCountVoiceTranscript('tree passengers');

    expect(oneResult.status).toBe('match');
    expect(twoResult.status).toBe('match');
    expect(threeResult.status).toBe('match');

    if (oneResult.status !== 'match' || twoResult.status !== 'match' || threeResult.status !== 'match') {
      throw new Error('Expected matched noisy passenger count results.');
    }

    expect(oneResult.passengerCount).toBe(1);
    expect(twoResult.passengerCount).toBe(2);
    expect(threeResult.passengerCount).toBe(3);
  });
});

describe('parseStopReminderFollowUpTranscript', () => {
  it('matches next follow-up commands', () => {
    const result = parseStopReminderFollowUpTranscript('next');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop reminder follow-up result.');
    }

    expect(result.command).toBe('next-stop');
  });

  it('matches wrong as a correction command', () => {
    const result = parseStopReminderFollowUpTranscript('wrong');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched stop reminder follow-up result.');
    }

    expect(result.command).toBe('correct-last');
  });

  it('matches undo as a recovery command', () => {
    const result = parseStopReminderFollowUpTranscript('undo last');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched undo follow-up result.');
    }

    expect(result.command).toBe('undo-last');
  });

  it('matches pause alerts as a follow-up command', () => {
    const result = parseStopReminderFollowUpTranscript('pause alerts');

    expect(result.status).toBe('match');
    if (result.status !== 'match') {
      throw new Error('Expected a matched pause follow-up result.');
    }

    expect(result.command).toBe('pause-alerts');
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
