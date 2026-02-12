import { useState, useRef, useEffect } from 'react';
import type { BoardItem as BoardItemType } from '../services/board.api';
import './BoardItem.css';

interface BoardItemProps {
  item: BoardItemType;
  onUpdate: (id: number, position: { x: number; y: number }) => void;
  onDelete: (id: number) => void;
  onSelect: (id: number) => void;
  isSelected: boolean;
  scale: number;
}

const BoardItem = ({ item, onUpdate, onDelete, onSelect, isSelected, scale }: BoardItemProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.item-delete-btn')) {
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
        onSelect(item.id);
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
      className={`board-item ${item.item_type} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${item.position_x}px`,
        top: `${item.position_y}px`,
        width: `${item.width}px`,
        minHeight: `${item.height}px`,
      }}
      onMouseDown={handleMouseDown}
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
        {getItemContent()}
      </div>
      {/* Connection point indicators */}
      <div className="connection-point connection-point-top" data-item-id={item.id} data-point="top" />
      <div className="connection-point connection-point-right" data-item-id={item.id} data-point="right" />
      <div className="connection-point connection-point-bottom" data-item-id={item.id} data-point="bottom" />
      <div className="connection-point connection-point-left" data-item-id={item.id} data-point="left" />
    </div>
  );
};

export default BoardItem;
