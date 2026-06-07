export function isPasswordRequired(): boolean {
  if (process.env.DEMO_MODE === 'true') return false
  const envPassword = process.env.APP_PASSWORD
  return typeof envPassword === 'string' && envPassword.length > 0
}

export function verifyPassword(password: string | null | undefined): boolean {
  if (!isPasswordRequired()) return true
  return password === process.env.APP_PASSWORD
}

export function checkRequestAuth(req: Request): boolean {
  if (!isPasswordRequired()) return true

  // 1. Try header 'x-app-password'
  let password = req.headers.get('x-app-password')

  // 2. Try Authorization header (Bearer token style)
  if (!password) {
    const authHeader = req.headers.get('authorization')
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      password = authHeader.substring(7)
    }
  }

  // 3. Try query parameters (e.g. for MCP clients: ?apiKey=... or ?password=...)
  if (!password) {
    try {
      const url = new URL(req.url)
      password = url.searchParams.get('apiKey') || url.searchParams.get('password')
    } catch {
      // Ignore URL parsing errors (e.g. invalid relative URL)
    }
  }

  return verifyPassword(password)
}
