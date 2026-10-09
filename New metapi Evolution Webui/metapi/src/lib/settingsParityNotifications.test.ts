import { describe, expect, it } from 'vitest';
import { notificationDraft, notificationPayload } from './settingsParityNotifications';

describe('notification runtime contracts', () => {
  it('loads Telegram endpoint, proxy and topic as well as chat id', () => {
    expect(notificationDraft('telegram', {telegramEnabled: true, telegramApiBaseUrl: 'https://telegram.test', telegramChatId: '123', telegramMessageThreadId: '45', telegramUseSystemProxy: true, telegramBotTokenMasked: '****'})).toEqual({telegramEnabled: true, telegramApiBaseUrl: 'https://telegram.test', telegramChatId: '123', telegramMessageThreadId: '45', telegramUseSystemProxy: true, telegramBotToken: ''});
  });
  it('omits blank secrets rather than re-sending masks or clearing existing secrets', () => {
    expect(notificationPayload('telegram', notificationDraft('telegram', {}))).not.toHaveProperty('telegramBotToken');
    expect(notificationPayload('smtp', notificationDraft('smtp', {}))).not.toHaveProperty('smtpPass');
  });
  it('persists credentials and all configurable channel fields', () => {
    expect(notificationPayload('telegram', {telegramBotToken: 'secret', telegramMessageThreadId: '5', telegramUseSystemProxy: false})).toEqual({telegramBotToken: 'secret', telegramMessageThreadId: '5', telegramUseSystemProxy: false});
  });
  it('uses no prototype destinations when runtime settings are missing', () => {
    expect(notificationDraft('webhook', {})).toEqual({webhookEnabled: false, webhookUrl: ''});
  });
});
