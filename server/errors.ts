import type { ProviderErrorCode } from '../shared/types'

export class ServiceError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean

  constructor(code: string, status: number, message: string, retryable = false) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

const PROVIDER_STATUS: Record<ProviderErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_SITE: 422,
  NEWS_NOT_SUPPORTED: 422,
  PROVIDER_UNAVAILABLE: 503,
  NOT_FOUND_OR_PRIVATE: 404,
  COMMENTS_DISABLED: 409,
  NO_COMMENTS: 409,
  QUOTA_EXCEEDED: 503,
  UPSTREAM_FAILED: 502,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
}

export class ProviderError extends ServiceError {
  constructor(code: ProviderErrorCode, message: string) {
    super(code, PROVIDER_STATUS[code], message, ['UPSTREAM_FAILED', 'TIMEOUT', 'RATE_LIMITED'].includes(code))
    this.name = 'ProviderError'
  }
}
