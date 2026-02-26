import { useState, useRef, useEffect } from 'react';
import type { BoardAnchor, BoardItem as BoardItemType } from '../services/board.api';
import './BoardItem.css';

interface BoardItemProps {
  item: BoardItemType;
  onUpdate: (id: number, position: { x: number; y: number }) => void;
  onDelete: (id: number) => void;
  onSelect: (id: number, options?: { shiftKey?: boolean; metaKey?: boolean; doubleClick?: boolean }) => void;
  onConnectRequest: (
    id: number,
    options?: { clientX?: number; clientY?: number; dragStart?: boolean; anchor?: BoardAnchor }
  ) => void;
  isSelected: boolean;
  isConnectionSource: boolean;
  scale: number;
  evidencePreviewUrls?: string[];
}

const BoardItem = ({
  item,
  onUpdate,
  onDelete,
  onSelect,
  onConnectRequest,
  isSelected,
  isConnectionSource,
  scale,
  evidencePreviewUrls = [],
}: BoardItemProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imageLoadError, setImageLoadError] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.item-delete-btn, .connection-point')) {
      return;
    }

    e.preventDefault();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
    setIsDragging(true);

    const rect = itemRef.current?.getBoundingClientRect();
    const container = itemRef.current?.parentElement;
    const scrollLeft = container?.scrollLeft || 0;
    const scrollTop = container?.scrollTop || 0;
    if (rect) {
      setDragOffset({
        x: (e.clientX - rect.left + scrollLeft) / scale,
        y: (e.clientY - rect.top + scrollTop) / scale,
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!itemRef.current) return;

      const container = itemRef.current.parentElement;
      if (!container) return;

      const distance = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
      if (distance > 4) {
        hasMovedRef.current = true;
      }

      const containerRect = container.getBoundingClientRect();
      const newX = Math.max(
        12,
        (e.clientX - containerRect.left + container.scrollLeft) / scale - dragOffset.x
      );
      const newY = Math.max(
        12,
        (e.clientY - containerRect.top + container.scrollTop) / scale - dragOffset.y
      );

      // Update position immediately for smooth dragging
      itemRef.current.style.left = `${newX}px`;
      itemRef.current.style.top = `${newY}px`;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!itemRef.current) return;
      
      const container = itemRef.current.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newX = Math.max(
        12,
        (e.clientX - containerRect.left + container.scrollLeft) / scale - dragOffset.x
      );
      const newY = Math.max(
        12,
        (e.clientY - containerRect.top + container.scrollTop) / scale - dragOffset.y
      );

      if (hasMovedRef.current) {
        onUpdate(item.id, { x: newX, y: newY });
      } else {
        onSelect(item.id, {
          shiftKey: e.shiftKey,
          metaKey: e.metaKey || e.ctrlKey,
        });
      }
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragOffset, isDragging, item.id, onSelect, onUpdate, scale]);

  useEffect(() => {
    setImageLoadError(false);
    setPreviewIndex(0);
  }, [evidencePreviewUrls]);

  const activePreviewUrl = evidencePreviewUrls[previewIndex] || null;

  const startConnectionDrag = (event: React.MouseEvent, anchor: BoardAnchor) => {
    event.preventDefault();
    event.stopPropagation();
    onConnectRequest(item.id, {
      clientX: event.clientX,
      clientY: event.clientY,
      dragStart: true,
      anchor,
    });
  };

  const getItemIcon = () => {
    switch (item.item_type) {
      case 'note':
        return '📝';
      case 'evidence':
        return '🔍';
      case 'witness':
        return '👤';
      case 'suspect':
        return '🔴';
      default:
        return '📌';
    }
  };

  const getItemTitle = () => {
    switch (item.item_type) {
      case 'note':
        return 'یادداشت';
      case 'evidence':
        return item.evidence_title || 'مدرک';
      case 'witness':
        return item.username || 'شاهد';
      case 'suspect':
        return item.username || 'مظنون';
      default:
        return 'آیتم';
    }
  };

  const getItemContent = () => {
    switch (item.item_type) {
      case 'note':
        return item.note_text;
      case 'evidence':
        return `مدرک: ${item.evidence_title || 'نامشخص'}`;
      case 'witness':
        return `شاهد: ${item.username || 'نامشخص'}`;
      case 'suspect':
        return `مظنون: ${item.username || 'نامشخص'}`;
      default:
        return '';
    }
  };

  return (
    <div
      ref={itemRef}
      data-board-item-id={item.id}
      className={`board-item ${item.item_type} ${isSelected ? 'selected' : ''} ${isConnectionSource ? 'connect-source' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${Math.max(12, item.position_x)}px`,
        top: `${Math.max(12, item.position_y)}px`,
        width: `${item.width}px`,
        minHeight: `${item.height}px`,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onSelect(item.id, { doubleClick: true })}
    >
      <div className="item-header">
        <span className="item-icon">{getItemIcon()}</span>
        <span className="item-title">{getItemTitle()}</span>
        <button
          className="item-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          title="حذف"
        >
          ×
        </button>
      </div>
      <div className="item-content">
        {item.item_type === 'evidence' && activePreviewUrl && !imageLoadError ? (
          <div className="board-item-evidence-preview">
            <img
              src={activePreviewUrl}
              alt={item.evidence_title || 'evidence preview'}
              loading="lazy"
              onError={() => {
                if (previewIndex + 1 < evidencePreviewUrls.length) {
                  setPreviewIndex((prev) => prev + 1);
                } else {
                  setImageLoadError(true);
                }
              }}
            />
          </div>
        ) : null}
        <div className="item-content-text">{getItemContent()}</div>
      </div>
      {/* Edge drag zones: allow starting connection from any point around card */}
      <div
        className="connection-edge connection-edge-top"
        data-connection-anchor="top"
        onMouseDown={(event) => startConnectionDrag(event, 'top')}
      />
      <div
        className="connection-edge connection-edge-right"
        data-connection-anchor="right"
        onMouseDown={(event) => startConnectionDrag(event, 'right')}
      />
      <div
        className="connection-edge connection-edge-bottom"
        data-connection-anchor="bottom"
        onMouseDown={(event) => startConnectionDrag(event, 'bottom')}
      />
      <div
        className="connection-edge connection-edge-left"
        data-connection-anchor="left"
        onMouseDown={(event) => startConnectionDrag(event, 'left')}
      />

      {/* Connection point indicators */}
      <div
        className="connection-point connection-point-top"
        data-item-id={item.id}
        data-point="top"
        data-connection-anchor="top"
        onMouseDown={(event) => startConnectionDrag(event, 'top')}
      />
      <div
        className="connection-point connection-point-right"
        data-item-id={item.id}
        data-point="right"
        data-connection-anchor="right"
        onMouseDown={(event) => startConnectionDrag(event, 'right')}
      />
      <div
        className="connection-point connection-point-bottom"
        data-item-id={item.id}
        data-point="bottom"
        data-connection-anchor="bottom"
        onMouseDown={(event) => startConnectionDrag(event, 'bottom')}
      />
      <div
        className="connection-point connection-point-left"
        data-item-id={item.id}
        data-point="left"
        data-connection-anchor="left"
        onMouseDown={(event) => startConnectionDrag(event, 'left')}
      />
    </div>
  );
};

export default BoardItem;
