export const NOTIFY_KINDS = ['webhook', 'bark', 'serverchan', 'telegram', 'smtp'] as const;
export type NotifyKind = typeof NOTIFY_KINDS[number];
export type NotificationDraft = Record<string, string | number | boolean>;

type NotificationField = { key: string; type: 'text' | 'password' | 'number' | 'boolean'; default: string | number | boolean };
export const NOTIFICATION_FIELDS: Record<NotifyKind, NotificationField[]> = {
  webhook: [{key: 'webhookEnabled', type: 'boolean', default: false}, {key: 'webhookUrl', type: 'text', default: ''}],
  bark: [{key: 'barkEnabled', type: 'boolean', default: false}, {key: 'barkUrl', type: 'text', default: ''}],
  serverchan: [{key: 'serverChanEnabled', type: 'boolean', default: false}, {key: 'serverChanKey', type: 'password', default: ''}],
  telegram: [
    {key: 'telegramEnabled', type: 'boolean', default: false},
    {key: 'telegramApiBaseUrl', type: 'text', default: 'https://api.telegram.org'},
    {key: 'telegramBotToken', type: 'password', default: ''},
    {key: 'telegramChatId', type: 'text', default: ''},
    {key: 'telegramUseSystemProxy', type: 'boolean', default: false},
    {key: 'telegramMessageThreadId', type: 'text', default: ''},
  ],
  smtp: [
    {key: 'smtpEnabled', type: 'boolean', default: false},
    {key: 'smtpHost', type: 'text', default: ''},
    {key: 'smtpPort', type: 'number', default: 587},
    {key: 'smtpSecure', type: 'boolean', default: false},
    {key: 'smtpUser', type: 'text', default: ''},
    {key: 'smtpPass', type: 'password', default: ''},
    {key: 'smtpFrom', type: 'text', default: ''},
    {key: 'smtpTo', type: 'text', default: ''},
  ],
};

export function notificationDraft(kind: NotifyKind, settings: Record<string, unknown>): NotificationDraft {
  return Object.fromEntries(NOTIFICATION_FIELDS[kind].map(field => [field.key,
    field.type === 'password' ? '' : typeof settings[field.key] === typeof field.default ? settings[field.key] : field.default,
  ])) as NotificationDraft;
}

export function notificationPayload(kind: NotifyKind, draft: NotificationDraft): Record<string, unknown> {
  return Object.fromEntries(NOTIFICATION_FIELDS[kind].flatMap(field => {
    const value = draft[field.key];
    if (value === undefined || field.type === 'password' && !value) return [];
    return [[field.key, field.type === 'number' ? Number(value) : value]];
  }));
}
