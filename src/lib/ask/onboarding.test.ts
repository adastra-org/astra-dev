// Avance del onboarding (portado de los tests de `eternum/lux`).
import { describe, expect, test } from 'bun:test'
import {
  isLastStep,
  nextStepIndex,
  ONBOARDING_STEPS,
  onboardingProgress,
  previousStepIndex,
} from './onboarding'

const N = ONBOARDING_STEPS.length

describe('pasos', () => {
  test('arranca en la bienvenida y termina en el color', () => {
    expect(ONBOARDING_STEPS[0]).toBe('hello')
    expect(ONBOARDING_STEPS.at(-1)).toBe('color')
  })

  test('next y previous no se salen del recorrido', () => {
    expect(nextStepIndex(0, N)).toBe(1)
    expect(nextStepIndex(N - 1, N)).toBe(N - 1)
    expect(previousStepIndex(1, N)).toBe(0)
    expect(previousStepIndex(0, N)).toBe(0)
    expect(nextStepIndex(0, 0)).toBe(0)
  })

  test('isLastStep', () => {
    expect(isLastStep(0, N)).toBe(false)
    expect(isLastStep(N - 1, N)).toBe(true)
    expect(isLastStep(0, 0)).toBe(false)
  })

  test('progreso: el primer paso ya cuenta y el último es 100', () => {
    expect(onboardingProgress(0, 3)).toBe(33)
    expect(onboardingProgress(1, 3)).toBe(67)
    expect(onboardingProgress(2, 3)).toBe(100)
    expect(onboardingProgress(9, 3)).toBe(100)
    expect(onboardingProgress(0, 0)).toBe(0)
  })
})
