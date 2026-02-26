import type { BoardAnchor, BoardLink as BoardLinkType, BoardItem } from '../services/board.api';
import './BoardLinks.css';

interface BoardLinksProps {
  links: BoardLinkType[];
  items: BoardItem[];
  scale: number;
  onDeleteLink: (linkId: number) => void;
  draftLink?:
    | {
        from_item: number;
        to_x: number;
        to_y: number;
        from_x?: number;
        from_y?: number;
        from_point?: BoardAnchor;
      }
    | null;
}

const BoardLinks = ({ links, items, onDeleteLink, draftLink }: BoardLinksProps) => {
  const getAnchorPoint = (itemId: number, anchor: BoardAnchor | undefined) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return { x: 0, y: 0 };

    const safeX = Math.max(12, item.position_x);
    const safeY = Math.max(12, item.position_y);
    const centerX = safeX + item.width / 2;
    const centerY = safeY + item.height / 2;
    const normalized = anchor || 'center';

    switch (normalized) {
      case 'top':
        return { x: centerX, y: safeY };
      case 'right':
        return { x: safeX + item.width, y: centerY };
      case 'bottom':
        return { x: centerX, y: safeY + item.height };
      case 'left':
        return { x: safeX, y: centerY };
      case 'center':
      default:
        return { x: centerX, y: centerY };
    }
  };

  return (
    <svg className="board-links-svg" style={{ pointerEvents: 'none' }}>
      {links.map((link) => {
        const fromPoint = getAnchorPoint(link.from_item, link.from_point);
        const toPoint = getAnchorPoint(link.to_item, link.to_point);
        const deleteX = (fromPoint.x + toPoint.x) / 2;
        const deleteY = (fromPoint.y + toPoint.y) / 2;

        return (
          <g key={link.id}>
            <line
              x1={fromPoint.x}
              y1={fromPoint.y}
              x2={toPoint.x}
              y2={toPoint.y}
              stroke="#dc2626"
              strokeWidth="2.8"
              className="board-link-path"
            />
            {/* Delete button for link */}
            <g
              className="link-delete-btn"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onClick={() => onDeleteLink(link.id)}
            >
              <circle
                cx={deleteX}
                cy={deleteY}
                r="12"
                fill="white"
                stroke="#dc2626"
                strokeWidth="2"
              />
              <text
                x={deleteX}
                y={deleteY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#dc2626"
                fontSize="16"
                fontWeight="bold"
              >
                ×
              </text>
            </g>
          </g>
        );
      })}
      {draftLink && (
        <line
          x1={
            typeof draftLink.from_x === 'number'
              ? draftLink.from_x
              : getAnchorPoint(draftLink.from_item, draftLink.from_point).x
          }
          y1={
            typeof draftLink.from_y === 'number'
              ? draftLink.from_y
              : getAnchorPoint(draftLink.from_item, draftLink.from_point).y
          }
          x2={draftLink.to_x}
          y2={draftLink.to_y}
          stroke="#ef4444"
          strokeWidth="2.5"
          className="board-link-path draft"
        />
      )}
    </svg>
  );
};

export default BoardLinks;
