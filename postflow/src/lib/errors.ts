import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

// ── Custom Error Classes ──────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues?: Record<string, string[]>
  ) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

// ── Centralised Route Error Handler ──────────────────────────────────────────

/**
 * Maps any thrown value to an appropriate NextResponse.
 *
 * Handles (in order):
 *  1. AppError subclasses (ValidationError, AuthError, NotFoundError, ConflictError)
 *  2. Prisma known-request errors (unique violation → 409, record not found → 404)
 *  3. Prisma validation errors → 400
 *  4. Everything else → 500 with a generic message
 */
export function handleRouteError(err: unknown): NextResponse {
  // ── App-level errors ───────────────────────────────────────────────────────
  if (err instanceof ValidationError) {
    return NextResponse.json(
      {
        error: err.message,
        ...(err.issues && { issues: err.issues }),
      },
      { status: 400 }
    );
  }

  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  // ── Prisma errors ──────────────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return NextResponse.json(
          { error: "Resource already exists" },
          { status: 409 }
        );
      case "P2025":
        return NextResponse.json(
          { error: "Resource not found" },
          { status: 404 }
        );
      default:
        console.error("[DB] PrismaClientKnownRequestError:", err.code, err.message);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("[DB] PrismaClientValidationError:", err.message);
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error("[DB] PrismaClientInitializationError:", err.message);
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }

  // ── Unexpected errors ──────────────────────────────────────────────────────
  console.error("[API] Unexpected error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
