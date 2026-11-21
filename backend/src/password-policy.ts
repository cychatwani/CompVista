export function passwordRequirements(password: string): boolean[] {
  return [password.length >= 10, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)];
}
export function validNewPassword(password: string): boolean {
  return passwordRequirements(password).every(Boolean);
}
