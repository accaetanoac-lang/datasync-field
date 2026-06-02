// Bridge entre api.ts e AuthContext: evita importação circular.
// api.ts chama triggerUnauthorized(); AuthContext registra o handler via setUnauthorizedHandler().

type Handler = () => void;

let unauthorizedHandler: Handler | null = null;

export function setUnauthorizedHandler(fn: Handler): void {
  unauthorizedHandler = fn;
}

export function triggerUnauthorized(): void {
  unauthorizedHandler?.();
}
