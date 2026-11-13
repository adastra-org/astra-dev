// Onboarding con Ether: pasos y avance. Sin React, para poder probarlo. Portado de
// `eternum/lux` (lib/onboarding.ts); la persistencia vive en `prefs.ts`.

/** Pasos del recorrido, en orden. */
export const ONBOARDING_STEPS = ['hello', 'tone', 'color'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

const clamp = (index: number, total: number): number =>
  total <= 0 ? 0 : Math.min(Math.max(index, 0), total - 1)

/** Índice siguiente, sin pasarse del último paso. */
export const nextStepIndex = (index: number, total: number): number =>
  clamp(index + 1, total)

/** Índice anterior, sin bajar del primero. */
export const previousStepIndex = (index: number, total: number): number =>
  clamp(index - 1, total)

export const isLastStep = (index: number, total: number): boolean =>
  total > 0 && index >= total - 1

/** Porcentaje completado hasta el paso actual (el primero ya cuenta). */
export const onboardingProgress = (index: number, total: number): number =>
  total <= 0 ? 0 : Math.round(((clamp(index, total) + 1) / total) * 100)
