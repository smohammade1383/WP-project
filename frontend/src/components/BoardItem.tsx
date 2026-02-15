import { useState, useRef, useEffect } from 'react';
import type { BoardItem as BoardItemType } from '../services/board.api';
import './BoardItem.css';

interface BoardItemProps {
  item: BoardItemType;
  onUpdate: (id: number, position: { x: number; y: number }) => void;
  onDelete: (id: number) => void;
  onSelect: (id: number, options?: { shiftKey?: boolean; metaKey?: boolean; doubleClick?: boolean }) => void;
  onConnectRequest: (
    id: number,
    options?: {
      clientX?: number;
      clientY?: number;
      dragStart?: boolean;
      point?: 'top' | 'right' | 'bottom' | 'left';
    }
  ) => void;
  isSelected: boolean;
  isConnectionSource: boolean;
  scale: number;
  evidencePreviewUrl?: string | null;
  dragDisabled?: boolean;
  connectionsDisabled?: boolean;
  deleteDisabled?: boolean;
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
  evidencePreviewUrl,
  dragDisabled = false,
  connectionsDisabled = false,
  deleteDisabled = false,
}: BoardItemProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [previewHasError, setPreviewHasError] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreviewHasError(false);
  }, [evidencePreviewUrl]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (dragDisabled) return;
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
      const newX = (e.clientX - containerRect.left + container.scrollLeft) / scale - dragOffset.x;
      const newY = (e.clientY - containerRect.top + container.scrollTop) / scale - dragOffset.y;

      // Update position immediately for smooth dragging
      itemRef.current.style.left = `${newX}px`;
      itemRef.current.style.top = `${newY}px`;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!itemRef.current) return;
      
      const container = itemRef.current.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newX = (e.clientX - containerRect.left + container.scrollLeft) / scale - dragOffset.x;
      const newY = (e.clientY - containerRect.top + container.scrollTop) / scale - dragOffset.y;

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
        left: `${item.position_x}px`,
        top: `${item.position_y}px`,
        width: `${item.width}px`,
        minHeight: `${item.height}px`,
        cursor: dragDisabled ? 'default' : undefined,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onSelect(item.id, { doubleClick: true })}
    >
      <div className="item-header">
        <span className="item-icon">{getItemIcon()}</span>
        <span className="item-title">{getItemTitle()}</span>
        <button
          className="item-delete-btn"
          disabled={deleteDisabled}
          onClick={(e) => {
            e.stopPropagation();
            if (deleteDisabled) return;
            onDelete(item.id);
          }}
          title="حذف"
        >
          ×
        </button>
      </div>
      <div className="item-content">
        {item.item_type === 'evidence' ? (
          <div className="evidence-content">
            <p className="evidence-summary">{getItemContent()}</p>
            {Boolean(evidencePreviewUrl) && !previewHasError && (
              <div className="evidence-preview">
                <img
                  src={evidencePreviewUrl || ''}
                  alt={item.evidence_title || 'پیش نمایش مدرک'}
                  className="evidence-preview-image"
                  loading="lazy"
                  onError={() => setPreviewHasError(true)}
                />
              </div>
            )}
          </div>
        ) : (
          getItemContent()
        )}
      </div>
      {/* Connection point indicators */}
      {!connectionsDisabled && (
        <>
          <div
            className="connection-point connection-point-top"
            data-item-id={item.id}
            data-point="top"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConnectRequest(item.id, {
                clientX: event.clientX,
                clientY: event.clientY,
                dragStart: true,
                point: 'top',
              });
            }}
          />
          <div
            className="connection-point connection-point-right"
            data-item-id={item.id}
            data-point="right"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConnectRequest(item.id, {
                clientX: event.clientX,
                clientY: event.clientY,
                dragStart: true,
                point: 'right',
              });
            }}
          />
          <div
            className="connection-point connection-point-bottom"
            data-item-id={item.id}
            data-point="bottom"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConnectRequest(item.id, {
                clientX: event.clientX,
                clientY: event.clientY,
                dragStart: true,
                point: 'bottom',
              });
            }}
          />
          <div
            className="connection-point connection-point-left"
            data-item-id={item.id}
            data-point="left"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConnectRequest(item.id, {
                clientX: event.clientX,
                clientY: event.clientY,
                dragStart: true,
                point: 'left',
              });
            }}
          />
        </>
      )}
    </div>
  );
};

export default BoardItem;
