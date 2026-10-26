import type { NextFunction, Request, Response } from 'express'

/** IP·용도별 1분 고정 창 요청 수 제한(외부 API·로그인 남용 방지). 단일 프로세스 개발 서버용이다. */
export function createRateLimiter(now: () => Date) {
  const windows = new Map<string, { start: number; count: number }>()
  return (bucket: string, perMinute: number) => (req: Request, res: Response, next: NextFunction) => {
    const key = `${bucket}:${req.ip ?? 'unknown'}`
    const at = now().getTime()
    const current = windows.get(key)
    if (!current || at - current.start >= 60_000) {
      windows.set(key, { start: at, count: 1 })
      return next()
    }
    current.count += 1
    if (current.count > perMinute) {
      res.setHeader('Retry-After', String(Math.ceil((60_000 - (at - current.start)) / 1000)))
      return void res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 잦습니다. 잠시 후 다시 시도하세요', retryable: true } })
    }
    next()
  }
}
