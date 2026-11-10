import { z } from 'zod';

/**
 * Client-side checks only for quick feedback (frontend.md §4). The API validates again
 * and is the source of truth; its field errors are shown the same way.
 */
export const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(100, 'Не длиннее 100 символов'),
  email: z.string().trim().pipe(z.email('Введите корректный email')),
  password: z.string().min(8, 'Минимум 8 символов').max(128, 'Не длиннее 128 символов'),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const loginFormSchema = z.object({
  email: z.string().trim().pipe(z.email('Введите корректный email')),
  password: z.string().min(1, 'Введите пароль'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
