/*
 * MessageSearch.jsx — In-Room Message Search Bar
 *
 * Purpose:
 *   A search panel that slides in below the ChatArea header when the user
 *   clicks the Search button (or presses Ctrl+F). Allows full-text keyword
 *   search within the currently open room.
 *
 * How it works:
 *   1. The user types a keyword and presses Enter (or re-clicks Search).
 *   2. api.searchMessages(roomId, keyword) sends a GET request to the
 *      message-service which performs a full-text search in the database.
 *   3. Results are displayed as a list of message cards with:
 *      - Sender ID and timestamp
 *      - Message content with the search term highlighted in yellow (via <mark>)
 *   4. Clearing the input resets the results and the "searched" state.
 *
 * highlight(text, q) — splits the message content around occurrences of the
 *   search query using a case-insensitive regex, then wraps matching parts
 *   in <mark> tags which the browser renders as highlighted text.
 *   The regex is escaped to handle special characters in the query.
 *
 * Props:
 *   roomId  — the ID of the current room to search in
 *   onClose — called when the X button is clicked to close the search bar
 */
import { useState } from 'react'
import { api } from '../../services/api'
import { Search, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import './MessageSearch.css'

export default function MessageSearch({ roomId, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  /* handleSearch — calls the REST API to search messages and stores results */
  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true); setSearched(true)
    try {
      const msgs = await api.searchMessages(roomId, query.trim())
      setResults(msgs)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  /* Allow pressing Enter to trigger search without clicking a button */
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch() }

  /*
   * highlight(text, q) — renders message text with the search query highlighted.
   * Splits the string at every occurrence of the query (case-insensitive) and
   * replaces matching fragments with <mark> elements for yellow highlight styling.
   * Special regex characters in the query are escaped so literal dots, parens, etc.
   * don't break the regex.
   */
  const highlight = (text, q) => {
    if (!q) return text
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.split(regex).map((part, i) =>
      regex.test(part) ? <mark key={i}>{part}</mark> : part
    )
  }

  return (
    <div className="ms-panel fade-in">
      <div className="ms-head">
        <div className="ms-input-row">
          <Search size={16} className="ms-icon"/>
          <input
            className="ms-input"
            placeholder="Search messages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {/* Clear button — resets query, results, and searched state */}
          {query && (
            <button className="icon-btn" onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
              style={{ width: 26, height: 26 }}>
              <X size={14}/>
            </button>
          )}
        </div>
        {/* Close button — hides the entire search panel */}
        <button className="icon-btn" onClick={onClose}><X size={18}/></button>
      </div>

      <div className="ms-results">
        {/* Loading spinner while API call is in progress */}
        {loading && (
          <div className="ms-loading"><Loader2 size={18} className="spin"/></div>
        )}
        {/* Empty state — only shown after at least one search has been performed */}
        {!loading && searched && results.length === 0 && (
          <div className="ms-empty">No messages found for "{query}"</div>
        )}
        {/* Result cards — each shows sender, time, and highlighted content */}
        {results.map(msg => (
          <div key={msg.messageId} className="ms-result">
            <div className="ms-result-head">
              <span className="ms-result-sender">User #{msg.senderId}</span>
              <span className="ms-result-time">{msg.sentAt ? format(new Date(msg.sentAt), 'MMM d, HH:mm') : ''}</span>
            </div>
            <div className="ms-result-text">{highlight(msg.content || '', query)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
