/*
 * EmojiPicker.jsx — Emoji Picker Wrapper Component
 *
 * Purpose:
 *   A thin wrapper around the `emoji-picker-react` library that:
 *   1. Syncs the picker's theme (light/dark) with the app's theme from ThemeContext
 *   2. Uses native OS-rendered emoji (EmojiStyle.NATIVE) so no custom font files
 *      need to be downloaded — the emoji look exactly like what the user sees in
 *      their OS messages app
 *   3. Shows recently-used emoji at the top for quick access
 *   4. Exposes a simplified onSelect({ emoji, unified, names }) callback so callers
 *      don't need to understand the underlying library's event shape
 *
 * This component only renders the emoji grid itself. The popup/overlay container
 * is the caller's responsibility (MessageInput wraps it in mi-emoji-pop, and
 * EmojiReactions wraps it in rx-picker).
 *
 * Props:
 *   onSelect(data) — called with { emoji, unified, names } when the user picks an emoji
 *   width  (number) — pixel width of the picker grid (default 320)
 *   height (number) — pixel height of the picker grid (default 380)
 */
import EmojiPickerReact, { Theme, EmojiStyle, SuggestionMode } from 'emoji-picker-react'
import { useTheme } from '../../theme/ThemeContext'
import './EmojiPicker.css'

export default function EmojiPicker({ onSelect, width = 320, height = 380 }) {
  const { theme } = useTheme()
  const pickerTheme = theme === 'dark' ? Theme.DARK : Theme.LIGHT

  return (
    <div className="ep-wrap">
      <EmojiPickerReact
        theme={pickerTheme}
        emojiStyle={EmojiStyle.NATIVE}
        suggestedEmojisMode={SuggestionMode.RECENT}
        width={width}
        height={height}
        lazyLoadEmojis={true}
        searchPlaceholder="Search emoji…"
        previewConfig={{ showPreview: false }}
        skinTonesDisabled={false}
        onEmojiClick={(emojiData) => {
          onSelect?.({
            emoji: emojiData.emoji,
            unified: emojiData.unified,
            names: emojiData.names,
          })
        }}
      />
    </div>
  )
}
