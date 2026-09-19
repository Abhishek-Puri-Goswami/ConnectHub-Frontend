// What each plan really gets. These numbers mirror what the backend enforces:
//   room-service   RoomService            group chats 5 / 500, members per room 25 / 250
//   media-service  MediaTierLimits        storage 100 MB / 10 GB, max file 10 MB / 250 MB, uploads 5 / 30 per minute
//   message-service SubscriptionTierLimits messages 60 per minute for everyone (not a paid feature)
// There are two limit sets: FREE and paid. The backend still knows two paid *names* (PREMIUM, PLATINUM) for
// billing history and admin-granted roles, but both get the same paid limits, so the UI sells one plan: "Pro".
export const MESSAGES_PER_MINUTE = 60

export const PLAN_LIMITS = {
  FREE: { groupChats: 5,   membersPerRoom: 25,  storage: '100 MB', maxFile: '10 MB',  uploadsPerMinute: 5 },
  PRO:  { groupChats: 500, membersPerRoom: 250, storage: '10 GB',  maxFile: '250 MB', uploadsPerMinute: 30 },
}

// The paid plan as sold. `checkoutPlan` is the plan key payment-service expects (Premium, ₹100/month).
export const PRO_PLAN = { id: 'PRO', checkoutPlan: 'PREMIUM', name: 'Pro', price: '₹100', period: '/month' }

// Plan names the backend can report; anything other than FREE is a paid plan with the paid limits.
export function isPaidPlan(plan) {
  return !!plan && String(plan).toUpperCase() !== 'FREE'
}

export function featureList(tier) {
  const l = PLAN_LIMITS[tier === 'PRO' ? 'PRO' : 'FREE']
  return [
    `${l.groupChats} group chats`,
    `Up to ${l.membersPerRoom} members per room`,
    `${l.storage} media storage`,
    `${l.maxFile} max file size`,
    `${l.uploadsPerMinute} uploads/min`,
    `${MESSAGES_PER_MINUTE} messages/min`,
  ]
}
