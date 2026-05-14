/*
 * roomMembers.js — Room Member Enrichment Utilities
 *
 * Purpose:
 *   The room-service stores member records as lightweight objects containing
 *   only userId and role. To display a member list with names and avatars,
 *   we need to fetch the full profile for each member from the auth-service.
 *   These utilities handle that enrichment step.
 *
 * How enrichment works:
 *   1. enrichRoomMembers() receives the raw member array from the room-service.
 *   2. It extracts all unique userIds (deduplicating with a Set).
 *   3. It fetches each user's profile from the auth-service in parallel
 *      (Promise.all) to minimize wait time.
 *   4. It builds a Map from userId → profile for O(1) lookup.
 *   5. It merges each raw member with their profile data (name, avatar, status),
 *      preferring the profile's values over any stale cached values in the member record.
 *   6. If a profile fetch fails (user deleted, service down), the original member
 *      record is returned unchanged — the member still appears in the list,
 *      just without a name or avatar.
 *
 * getMemberDisplay() is a separate helper used by the member list UI to format
 * how each member is shown: a primary line (full name or @username) and a
 * secondary line (@username • ROLE).
 */
import { api } from '../services/api'

/*
 * enrichRoomMembers(rawMembers) — fetches and merges profile data for room members.
 *
 * Parameters:
 *   rawMembers — array of member objects from the room-service, each with at least { userId, role }
 *
 * Returns:
 *   A Promise that resolves to the same array with username, fullName, avatarUrl, and
 *   status fields populated from the auth-service profile endpoint.
 */
export async function enrichRoomMembers(rawMembers) {
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) return []

  const uniqueUserIds = [...new Set(
    rawMembers
      .map(member => member.userId)
      .filter(userId => userId != null)
  )]

  let profileMap = new Map()

  try {
    // Use the batch endpoint — one request for all members instead of N individual calls.
    // Falls back to individual fetches if the batch endpoint fails.
    const profiles = await api.getUsersByIds(uniqueUserIds)
    if (Array.isArray(profiles)) {
      profiles.forEach(profile => {
        if (profile?.userId != null) profileMap.set(profile.userId, profile)
        // Some backends key by 'id' instead of 'userId'
        else if (profile?.id != null) profileMap.set(profile.id, profile)
      })
    }
  } catch {
    // Batch failed — fall back to individual fetches
    const results = await Promise.all(uniqueUserIds.map(async (userId) => {
      try {
        const profile = await api.getProfile(userId)
        return [userId, profile]
      } catch {
        return [userId, null]
      }
    }))
    profileMap = new Map(results.filter(([, profile]) => profile))
  }

  return rawMembers.map(member => {
    const profile = profileMap.get(member.userId)
    if (!profile) return member

    return {
      ...member,
      username: profile.username || member.username,
      fullName: profile.fullName || member.fullName,
      // Normalise: some backends return 'avatarUrl', others 'avatar' or 'profilePicture'
      avatarUrl: profile.avatarUrl || profile.avatar || profile.profilePicture || member.avatarUrl || null,
      status: profile.status || member.status,
      bio: profile.bio || member.bio || null,
    }
  })
}

/*
 * getMemberDisplay(member) — formats a member object for display in the UI.
 *
 * Returns:
 *   {
 *     primary:   string — the main display line (full name, or @username, or "User <id>" as fallback)
 *     secondary: string — "@username • ROLE" (e.g., "@alice • ADMIN")
 *   }
 *
 * Used by RoomSettingsPanel and anywhere a member's name and role are shown together.
 */
export function getMemberDisplay(member) {
  const fullName = member.fullName?.trim()
  const username = member.username?.trim()
  const primary = fullName || username || `User ${member.userId ?? member.id ?? '?'}`

  const secondaryParts = []
  if (username) secondaryParts.push(`@${username}`)
  secondaryParts.push(member.role || 'MEMBER')

  return {
    primary,
    secondary: secondaryParts.join(' • '),
  }
}
