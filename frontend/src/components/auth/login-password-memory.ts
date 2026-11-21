// Retained only while the current client-side navigation remains alive.
let currentPassword = "";
export function rememberLoginPassword(password: string): void { currentPassword = password; }
export function loginPassword(): string { return currentPassword; }
export function forgetLoginPassword(): void { currentPassword = ""; }
