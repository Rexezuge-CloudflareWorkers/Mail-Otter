class NonRetryableError extends Error {
  constructor(message: string, name?: string  ) {
    super(message);
    this.name = name || 'NonRetryableError';
  }
}

export { NonRetryableError };
