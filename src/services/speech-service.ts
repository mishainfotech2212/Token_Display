import * as Speech from 'expo-speech';

import { CurrentToken } from './api-types';

export type DisplayLanguage = 'en' | 'hi';

export const LANGUAGE_OPTIONS: { label: string; value: DisplayLanguage }[] = [
  { label: 'English', value: 'en' },
  { label: 'Hindi', value: 'hi' },
];

const SPEECH_LANGUAGE_CODE: Record<DisplayLanguage, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
};

export class SpeechService {
  private queue = Promise.resolve();

  announceToken(token: CurrentToken, counterName: string, language: DisplayLanguage) {
    const message =
      language === 'hi'
        ? `Token ${token.ticket_number}, kripya counter ${counterName} par aaiye`
        : `Token ${token.ticket_number}, please proceed to counter ${counterName}`;

    return this.speak(message, language);
  }

  stop() {
    void Speech.stop();
    this.queue = Promise.resolve();
  }

  private speak(message: string, language: DisplayLanguage) {
    this.queue = this.queue.then(
      () =>
        new Promise<void>((resolve) => {
          Speech.speak(message, {
            language: SPEECH_LANGUAGE_CODE[language],
            pitch: 1.08,
            rate: 0.82,
            volume: 1,
            onDone: resolve,
            onStopped: resolve,
            onError: () => resolve(),
          });
        }),
    );

    return this.queue;
  }
}

export const speechService = new SpeechService();
