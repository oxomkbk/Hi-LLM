export const AUTH_MIN_PASSWORD_LENGTH = 12
export const AUTH_MAX_PASSWORD_LENGTH = 64

export function isStrongPassword(password: string) {
  return password.length >= AUTH_MIN_PASSWORD_LENGTH
    && password.length <= AUTH_MAX_PASSWORD_LENGTH
    && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)
}
