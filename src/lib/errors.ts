/**
 * CLASE DE ERROR CENTRALIZADA (AppError)
 * Evita la fragmentación de errores y permite un manejo consistente en la capa de transporte (Elysia).
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail?: string;

  constructor(code: string, message: string, status: number = 400, detail?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Factory para errores de validación
   */
  static validation(message: string, detail?: string) {
    return new AppError("VALIDATION_ERROR", message, 422, detail);
  }

  /**
   * Factory para errores de negocio/not found
   */
  static notFound(message: string) {
    return new AppError("NOT_FOUND", message, 404);
  }

  /**
   * Factory para errores de permisos
   */
  static forbidden(message: string = "No tienes permiso para realizar esta acción") {
    return new AppError("FORBIDDEN", message, 403);
  }
}

/**
 * Clase específica para errores de validación, utilizada para mantener
 * compatibilidad con bloques instanceof existentes en las rutas.
 */
export class ValidationError extends AppError {
  constructor(message: string, detail?: string) {
    super("VALIDATION_ERROR", message, 422, detail);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
