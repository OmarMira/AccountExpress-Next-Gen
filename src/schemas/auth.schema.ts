import { z } from "zod";

// ============================================================
// AUTH SCHEMAS — Input validation for auth routes
// ============================================================

export const LoginSchema = z.object({
  username:  z.string().min(1, "Username is required"),
  password:  z.string().min(1, "Password is required"),
  companyId: z.string().uuid().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string()
    .min(8, "New password must be at least 8 characters")
    .max(72, "New password must not exceed 72 characters"),
    // In v1, we only enforce length as per specs.
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

