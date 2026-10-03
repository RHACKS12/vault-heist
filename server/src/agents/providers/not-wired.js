// Shared error for provider stubs that are not yet connected to their SDK.
export class NotWiredError extends Error {
  constructor(provider, envVar, sdk) {
    super(
      `Provider "${provider}" is not wired yet. Set ${envVar} and implement the ${sdk} ` +
      `adapter (next milestone), or use a mock provider for now.`,
    );
    this.name = 'NotWiredError';
    this.code = 'NOT_WIRED';
    this.provider = provider;
  }
}
