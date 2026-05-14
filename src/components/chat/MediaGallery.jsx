/*
 * MediaGallery.jsx — Shared Media Gallery Panel
 *
 * Purpose:
 *   A modal panel that shows all files and images ever shared in a specific room.
 *   Accessed from ChatArea's info panel via "View shared media" (DMs only).
 *
 * What it shows:
 *   - Images: shown in a clickable thumbnail grid. Clicking opens a fullscreen lightbox.
 *   - Files (documents, videos, zip files): shown as a list with icon, name, size, and type.
 *     Each file row has a download link and (for the uploader) a delete button.
 *
 * Filter tabs:
 *   All | Images | Files — filters the displayed items without re-fetching from the API.
 *   The "All" tab shows images first (grid), then files (list) below them.
 *
 * Forward:
 *   Each item has a forward icon. Clicking it opens an inline room picker so the user
 *   can re-share the file/image into any other room or DM they belong to.
 *
 * Download:
 *   File rows use the HTML `download` attribute so browsers save the file instead of
 *   opening it. The lightbox also has a download button for images.
 *
 * Pre-signed URLs:
 *   The API returns short-lived pre-signed S3 URLs (15-minute TTL). The gallery
 *   re-fetches on every open, so URLs are always fresh.
 *
 * Rendered via React Portal into document.body to avoid z-index conflicts.
 *
 * Props:
 *   roomId  — the ID of the room to load media for
 *   onClose — called when the backdrop or close button is clicked
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import {
  Image, File, X, Loader2, Download, Film, FileText, Trash2, Forward, Check
} from 'lucide-react'
import './MediaGallery.css'

export default function MediaGallery({ roomId, onClose }) {
  const { user } = useAuthStore()
  const { rooms } = useChatStore()
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [lightbox, setLightbox] = useState(null) // { url, name } | null
  const [forwardItem, setForwardItem] = useState(null) // item being forwarded
  const [forwardedTo, setForwardedTo] = useState(null) // roomId just forwarded to
  const [deleteConfirm, setDeleteConfirm] = useState(null) // item pending delete confirmation

  /* Load all media for the room when the gallery opens. Pre-signed URLs expire in 15 min,
   * so we re-fetch on every open rather than caching across sessions. */
  useEffect(() => {
    if (!roomId) return
    setLoading(true)
    api.getRoomMedia(roomId)
      .then(data => setMedia(Array.isArray(data) ? data : []))
      .catch(() => setMedia([]))
      .finally(() => setLoading(false))
  }, [roomId])

  /*
   * isImage — checks if a media item is an image by MIME type or file extension.
   * Uses the correct field names from the MediaFile entity (mimeType, originalName).
   */
  const isImage = (item) => {
    const ct = (item.mimeType || '').toLowerCase()
    const fn = (item.originalName || item.url || '').toLowerCase()
    return ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fn)
  }

  const isVideo = (item) => (item.mimeType || '').toLowerCase().startsWith('video/')

  const images = media.filter(isImage)
  const files = media.filter(m => !isImage(m))

  const filtered = filter === 'images' ? images
    : filter === 'files' ? files
    : media

  /* handleDelete — opens the in-app confirm dialog instead of the browser's native confirm(). */
  const handleDelete = (item) => {
    setDeleteConfirm(item)
  }

  /* confirmDelete — called when the user taps "Delete" in the in-app confirm dialog. */
  const confirmDelete = async () => {
    if (!deleteConfirm) return
    const item = deleteConfirm
    setDeleteConfirm(null)
    try {
      await api.deleteMedia(item.mediaId)
      setMedia(prev => prev.filter(m => m.mediaId !== item.mediaId))
    } catch {}
  }

  /*
   * handleForward — sends the item into the chosen room via WebSocket.
   * Uses the same sendMessage path as normal file/image messages so the recipient
   * sees it with a proper bubble, preview, and sidebar update.
   */
  const handleForward = (targetRoomId) => {
    if (!forwardItem) return
    const type = isImage(forwardItem) ? 'IMAGE' : 'FILE'
    ws.sendMessage(targetRoomId, forwardItem.originalName || 'Shared file', type, null, forwardItem.url)
    setForwardedTo(targetRoomId)
    setTimeout(() => {
      setForwardItem(null)
      setForwardedTo(null)
    }, 1200)
  }

  /* Rooms available to forward to — exclude the current room */
  const forwardableRooms = rooms.filter(r => r.roomId !== roomId)

  return createPortal(
    <div className="media-gallery-overlay" onClick={onClose}>
      <div className="media-gallery-card" onClick={e => e.stopPropagation()}>
        {/* Header: title, total count, close button */}
        <div className="media-gallery-head">
          <div className="media-gallery-head-left">
            <div className="media-gallery-head-icon">
              <Image size={18} />
            </div>
            <div>
              <h2>Shared Media</h2>
              <p>{media.length} file{media.length !== 1 ? 's' : ''} shared in this room</p>
            </div>
          </div>
          <button className="media-gallery-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Filter tabs: All / Images / Files with counts */}
        <div className="media-gallery-tabs">
          {[
            { id: 'all', label: 'All', count: media.length },
            { id: 'images', label: 'Images', count: images.length },
            { id: 'files', label: 'Files', count: files.length },
          ].map(t => (
            <button
              key={t.id}
              className={`media-gallery-tab ${filter === t.id ? 'active' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.id === 'images' ? <Image size={12} /> :
               t.id === 'files' ? <File size={12} /> : null}
              {t.label}
              <span className="media-gallery-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="media-gallery-body">
          {loading ? (
            <div className="media-gallery-empty">
              <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p>Loading media…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="media-gallery-empty">
              <div className="media-gallery-empty-icon">
                <Image size={24} />
              </div>
              <h3>No {filter === 'all' ? 'media' : filter} shared yet</h3>
              <p>Files and images shared in this room will appear here</p>
            </div>
          ) : (
            <>
              {/* Image grid — thumbnail for the grid, full url for the lightbox */}
              {(filter === 'all' || filter === 'images') && images.length > 0 && (
                <div className="media-grid">
                  {(filter === 'images' ? images : images.slice(0, filter === 'all' ? 12 : undefined)).map((item, i) => (
                    <div
                      key={item.mediaId || i}
                      className="media-grid-item"
                      onClick={() => setLightbox({ url: item.url, name: item.originalName })}
                    >
                      <img
                        src={item.thumbnailUrl || item.url}
                        alt={item.originalName || 'Shared image'}
                        loading="lazy"
                      />
                      <div className="media-grid-item-overlay">
                        <span className="media-grid-item-name">
                          {item.originalName || 'Image'}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="media-item-del"
                            onClick={e => { e.stopPropagation(); setForwardItem(item) }}
                            title="Forward"
                          >
                            <Forward size={12}/>
                          </button>
                          {item.uploaderId === user?.userId && (
                            <button
                              className="media-item-del danger"
                              onClick={e => { e.stopPropagation(); handleDelete(item) }}
                              title="Delete"
                            >
                              <Trash2 size={12}/>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* File list — download link + forward + delete button for uploader */}
              {(filter === 'all' || filter === 'files') && files.length > 0 && (
                <div className="media-file-list" style={{ marginTop: filter === 'all' && images.length > 0 ? 20 : 0 }}>
                  {files.map((item, i) => (
                    <div key={item.mediaId || i} className="media-file-row">
                      <a
                        className="media-file-item"
                        href={item.url}
                        download={item.originalName || true}
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <div className="media-file-icon">
                          {isVideo(item) ? <Film size={18} /> : <FileText size={18} />}
                        </div>
                        <div className="media-file-info">
                          <div className="media-file-name">
                            {item.originalName || 'File'}
                          </div>
                          <div className="media-file-meta">
                            {item.sizeKb ? `${item.sizeKb} KB` : ''}
                            {item.mimeType ? ` · ${item.mimeType}` : ''}
                          </div>
                        </div>
                        <Download size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </a>
                      <button
                        className="media-item-del file-del"
                        onClick={() => setForwardItem(item)}
                        title="Forward"
                      >
                        <Forward size={14}/>
                      </button>
                      {item.uploaderId === user?.userId && (
                        <button
                          className="media-item-del file-del danger"
                          onClick={() => handleDelete(item)}
                          title="Delete"
                        >
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox — fullscreen image preview with download button */}
      {lightbox && (
        <div className="media-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt="Preview" onClick={e => e.stopPropagation()} />
          <div className="media-lightbox-actions" onClick={e => e.stopPropagation()}>
            <a
              href={lightbox.url}
              download={lightbox.name || true}
              className="media-lightbox-btn"
              title="Download"
            >
              <Download size={18} />
            </a>
            <button
              className="media-lightbox-btn"
              title="Forward"
              onClick={() => {
                const item = media.find(m => m.url === lightbox.url)
                if (item) { setLightbox(null); setForwardItem(item) }
              }}
            >
              <Forward size={18} />
            </button>
            <button
              className="media-lightbox-btn"
              title="Close"
              onClick={() => setLightbox(null)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm dialog — replaces the browser-native confirm() */}
      {deleteConfirm && (
        <div className="media-del-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="media-del-card" onClick={e => e.stopPropagation()}>
            <div className="media-del-icon">
              <Trash2 size={22} />
            </div>
            <div className="media-del-title">Delete file?</div>
            <div className="media-del-body">
              <strong>{deleteConfirm.originalName}</strong> will be permanently removed and cannot be recovered.
            </div>
            <div className="media-del-actions">
              <button className="media-del-btn cancel" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="media-del-btn confirm" onClick={confirmDelete}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward picker — inline room selector */}
      {forwardItem && (
        <div className="media-forward-overlay" onClick={() => setForwardItem(null)}>
          <div className="media-forward-card" onClick={e => e.stopPropagation()}>
            <div className="media-forward-head">
              <Forward size={15} />
              <span>Forward to…</span>
              <button className="media-gallery-close" style={{ marginLeft: 'auto' }} onClick={() => setForwardItem(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="media-forward-name">{forwardItem.originalName || 'File'}</div>
            <div className="media-forward-list">
              {forwardableRooms.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No other rooms available</p>
              ) : forwardableRooms.map(r => (
                <button
                  key={r.roomId}
                  className={`media-forward-room ${forwardedTo === r.roomId ? 'sent' : ''}`}
                  onClick={() => handleForward(r.roomId)}
                  disabled={!!forwardedTo}
                >
                  <span className="media-forward-room-name">{r.name || 'Room'}</span>
                  {forwardedTo === r.roomId
                    ? <Check size={14} style={{ color: 'var(--success, #22c55e)' }} />
                    : <Forward size={13} style={{ color: 'var(--text-muted)' }} />
                  }
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
