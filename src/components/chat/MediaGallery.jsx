/*
 * MediaGallery.jsx — Shared Media Gallery Panel
 *
 * Purpose:
 *   A modal panel that shows all files and images ever shared in a specific room.
 *   Accessed from ChatArea's info panel via "View shared media".
 *
 * What it shows:
 *   - Images: shown in a clickable thumbnail grid. Clicking opens a fullscreen lightbox.
 *   - Files (documents, videos, zip files): shown as a list with icon, name, size, and type.
 *     Each file row is a clickable download link that opens in a new tab.
 *
 * Filter tabs:
 *   All | Images | Files — filters the displayed items without re-fetching from the API.
 *   The "All" tab shows images first (grid), then files (list) below them,
 *   up to 12 images in grid view before switching to the Images tab for full list.
 *
 * How media type detection works:
 *   isImage(item) checks both the MIME type (contentType / mimeType) and the file
 *   extension as a fallback, since the backend may not always populate the MIME type.
 *   isVideo(item) checks only the MIME type for video/* content.
 *
 * Lightbox:
 *   Clicking an image sets the `lightbox` state to the image URL. A full-screen overlay
 *   shows the image at full size. Clicking the overlay (but not the image) closes it.
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
import {
  Image, File, X, Loader2, Download, Film, FileText
} from 'lucide-react'
import './MediaGallery.css'

export default function MediaGallery({ roomId, onClose }) {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [lightbox, setLightbox] = useState(null)

  /* Load all media for the room when the gallery opens */
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
   * Used to separate images (shown in grid) from other files (shown in list).
   */
  const isImage = (item) => {
    const ct = (item.contentType || item.mimeType || item.type || '').toLowerCase()
    const fn = (item.fileName || item.originalFilename || item.url || '').toLowerCase()
    return ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fn)
  }

  /* isVideo — checks if a media item is a video by MIME type */
  const isVideo = (item) => {
    const ct = (item.contentType || item.mimeType || item.type || '').toLowerCase()
    return ct.startsWith('video/')
  }

  const images = media.filter(isImage)
  const files = media.filter(m => !isImage(m))

  const filtered = filter === 'images' ? images
    : filter === 'files' ? files
    : media

  /* getUrl — extracts the download/display URL from the media item regardless of field name */
  const getUrl = (item) => item.url || item.fileUrl || item.downloadUrl || '#'

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
            /* Loading state while API call is in progress */
            <div className="media-gallery-empty">
              <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p>Loading media…</p>
            </div>
          ) : filtered.length === 0 ? (
            /* Empty state when there's nothing in the selected filter */
            <div className="media-gallery-empty">
              <div className="media-gallery-empty-icon">
                <Image size={24} />
              </div>
              <h3>No {filter === 'all' ? 'media' : filter} shared yet</h3>
              <p>Files and images shared in this room will appear here</p>
            </div>
          ) : (
            <>
              {/* Image grid — clicking a thumbnail opens the lightbox */}
              {(filter === 'all' || filter === 'images') && images.length > 0 && (
                <div className="media-grid">
                  {(filter === 'images' ? images : images.slice(0, filter === 'all' ? 12 : undefined)).map((item, i) => (
                    <div
                      key={item.id || i}
                      className="media-grid-item"
                      onClick={() => setLightbox(getUrl(item))}
                    >
                      <img
                        src={getUrl(item)}
                        alt={item.fileName || item.originalFilename || 'Shared image'}
                        loading="lazy"
                      />
                      <div className="media-grid-item-overlay">
                        <span className="media-grid-item-name">
                          {item.fileName || item.originalFilename || 'Image'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* File list — each row is a link that opens in a new tab for download */}
              {(filter === 'all' || filter === 'files') && files.length > 0 && (
                <div className="media-file-list" style={{ marginTop: filter === 'all' && images.length > 0 ? 20 : 0 }}>
                  {files.map((item, i) => (
                    <a
                      key={item.id || i}
                      className="media-file-item"
                      href={getUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <div className="media-file-icon">
                        {isVideo(item) ? <Film size={18} /> : <FileText size={18} />}
                      </div>
                      <div className="media-file-info">
                        <div className="media-file-name">
                          {item.fileName || item.originalFilename || 'File'}
                        </div>
                        <div className="media-file-meta">
                          {item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` : ''}
                          {item.contentType ? ` · ${item.contentType}` : ''}
                        </div>
                      </div>
                      <Download size={14} style={{ color: 'var(--text-muted)' }} />
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox — fullscreen image preview. Clicking the overlay closes it */}
      {lightbox && (
        <div className="media-lightbox" onClick={() => setLightbox(null)}>
          {/* stopPropagation prevents clicking the image itself from closing the lightbox */}
          <img src={lightbox} alt="Preview" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>,
    document.body
  )
}
