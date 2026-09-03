export type PlatformCapabilities = Readonly<{
  openAiResponsesFirst: boolean;
  retryAlternativeEndpointOnGone: boolean;
}>;

export declare function getPlatformCapabilities(platform: unknown): PlatformCapabilities;
