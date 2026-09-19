import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, PRO_PLAN, MESSAGES_PER_MINUTE, featureList, isPaidPlan } from './plans'

// These pin the numbers the backend enforces (see the header of plans.js). If a backend limit changes,
// this test is the reminder to update the UI text.
describe('plan limits shown in the UI', () => {
  it('matches the enforced FREE limits', () => {
    expect(PLAN_LIMITS.FREE).toEqual({ groupChats: 5, membersPerRoom: 25, storage: '100 MB', maxFile: '10 MB', uploadsPerMinute: 5 })
  })

  it('matches the enforced paid limits', () => {
    expect(PLAN_LIMITS.PRO).toEqual({ groupChats: 500, membersPerRoom: 250, storage: '10 GB', maxFile: '250 MB', uploadsPerMinute: 30 })
  })

  it('states the message rate as the same 60/min on every plan', () => {
    expect(MESSAGES_PER_MINUTE).toBe(60)
    expect(featureList('FREE')).toContain('60 messages/min')
    expect(featureList('PRO')).toContain('60 messages/min')
  })

  it('never advertises things that are not enforced', () => {
    const text = [...featureList('FREE'), ...featureList('PRO')].join(' ').toLowerCase()
    for (const banned of ['90-day', 'history', 'priority support', '4 gb', '8 gb', 'unlimited']) {
      expect(text).not.toContain(banned)
    }
  })

  it('lists paid features that really are better than free', () => {
    expect(featureList('PRO')).toEqual([
      '500 group chats', 'Up to 250 members per room', '10 GB media storage',
      '250 MB max file size', '30 uploads/min', '60 messages/min',
    ])
  })

  it('sells one paid plan whose checkout key is the existing Premium plan', () => {
    expect(PRO_PLAN).toMatchObject({ name: 'Pro', checkoutPlan: 'PREMIUM', price: '₹100' })
  })

  it('treats every non-FREE backend plan name (PREMIUM, PLATINUM, legacy PRO) as paid', () => {
    for (const p of ['PREMIUM', 'PLATINUM', 'PRO', 'premium']) expect(isPaidPlan(p)).toBe(true)
    for (const p of ['FREE', 'free', '', null, undefined]) expect(isPaidPlan(p)).toBe(false)
  })
})
