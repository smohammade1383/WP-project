import type { BoardLink as BoardLinkType, BoardItem } from '../services/board.api';
import './BoardLinks.css';

type ConnectionPointKey = 'top' | 'right' | 'bottom' | 'left';

interface BoardLinksProps {
  links: BoardLinkType[];
  items: BoardItem[];
  scale: number;
  onDeleteLink: (linkId: number) => void;
  linkPointMap?: Record<number, { from: ConnectionPointKey; to: ConnectionPointKey }>;
  draftLink?: { from_item: number; to_x: number; to_y: number; from_x?: number; from_y?: number } | null;
}

const BoardLinks = ({ links, items, onDeleteLink, linkPointMap = {}, draftLink }: BoardLinksProps) => {
  const getItemById = (itemId: number) => items.find((i) => i.id === itemId);

  const getItemCenter = (item: BoardItem) => ({
    x: item.position_x + item.width / 2,
    y: item.position_y + item.height / 2,
  });

  const getPointCoordinate = (item: BoardItem, point: ConnectionPointKey) => {
    const center = getItemCenter(item);
    const edgeOffset = 7;
    switch (point) {
      case 'top':
        return { x: center.x, y: item.position_y - edgeOffset };
      case 'right':
        return { x: item.position_x + item.width + edgeOffset, y: center.y };
      case 'bottom':
        return { x: center.x, y: item.position_y + item.height + edgeOffset };
      case 'left':
        return { x: item.position_x - edgeOffset, y: center.y };
      default:
        return center;
    }
  };

  const getAnchorPoint = (item: BoardItem, target: { x: number; y: number }) => {
    const center = getItemCenter(item);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const edgeOffset = 7;

    if (Math.abs(dx) > Math.abs(dy)) {
      return {
        x: dx >= 0 ? item.position_x + item.width + edgeOffset : item.position_x - edgeOffset,
        y: center.y,
      };
    }

    return {
      x: center.x,
      y: dy >= 0 ? item.position_y + item.height + edgeOffset : item.position_y - edgeOffset,
    };
  };

  const getLinkPoints = (linkId: number, fromItemId: number, toItemId: number) => {
    const fromItem = getItemById(fromItemId);
    const toItem = getItemById(toItemId);
    if (!fromItem || !toItem) return null;

    const fixedPoints = linkPointMap[linkId] || null;
    if (fixedPoints) {
      return {
        from: getPointCoordinate(fromItem, fixedPoints.from),
        to: getPointCoordinate(toItem, fixedPoints.to),
      };
    }

    const toCenter = getItemCenter(toItem);
    const fromAnchor = getAnchorPoint(fromItem, toCenter);
    const toAnchor = getAnchorPoint(toItem, fromAnchor);
    return { from: fromAnchor, to: toAnchor };
  };

  const calculatePathFromPoints = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  };

  return (
    <svg className="board-links-svg" style={{ pointerEvents: 'none' }}>
      {links.map((link) => {
        const points = getLinkPoints(link.id, link.from_item, link.to_item);
        if (!points) return null;

        const path = calculatePathFromPoints(points.from, points.to);
        const deleteX = (points.from.x + points.to.x) / 2;
        const deleteY = (points.from.y + points.to.y) / 2;

        return (
          <g key={link.id}>
            <path
              d={path}
              stroke="#dc2626"
              strokeWidth="3"
              fill="none"
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
        (() => {
          const fromItem = getItemById(draftLink.from_item);
          if (!fromItem && (typeof draftLink.from_x !== 'number' || typeof draftLink.from_y !== 'number')) {
            return null;
          }

          const targetPoint = { x: draftLink.to_x, y: draftLink.to_y };
          const fromPoint =
            typeof draftLink.from_x === 'number' && typeof draftLink.from_y === 'number'
              ? { x: draftLink.from_x, y: draftLink.from_y }
              : getAnchorPoint(fromItem as BoardItem, targetPoint);

          return (
            <path
              d={calculatePathFromPoints(fromPoint, targetPoint)}
              stroke="#ef4444"
              strokeWidth="2.5"
              fill="none"
              className="board-link-path draft"
            />
          );
        })()
      )}
    </svg>
  );
};

export default BoardLinks;
