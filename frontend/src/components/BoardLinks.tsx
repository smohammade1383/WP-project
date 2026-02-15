import type { BoardLink as BoardLinkType, BoardItem } from '../services/board.api';
import './BoardLinks.css';

interface BoardLinksProps {
  links: BoardLinkType[];
  items: BoardItem[];
  scale: number;
  onDeleteLink: (linkId: number) => void;
  draftLink?: {
    from_item: number;
    to_x: number;
    to_y: number;
    from_x?: number;
    from_y?: number;
    from_point?: 'top' | 'right' | 'bottom' | 'left';
  } | null;
}

const BoardLinks = ({ links, items, onDeleteLink, draftLink }: BoardLinksProps) => {
  const getItemById = (itemId: number) => items.find((i) => i.id === itemId);

  const getItemCenter = (item: BoardItem) => ({
    x: item.position_x + item.width / 2,
    y: item.position_y + item.height / 2,
  });

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

  const getConnectionPoint = (
    item: BoardItem,
    point: 'top' | 'right' | 'bottom' | 'left'
  ) => {
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
      default:
        return { x: item.position_x - edgeOffset, y: center.y };
    }
  };

  const getLinkPoints = (
    fromItemId: number,
    toItemId: number,
    fromPoint?: 'top' | 'right' | 'bottom' | 'left',
    toPoint?: 'top' | 'right' | 'bottom' | 'left'
  ) => {
    const fromItem = getItemById(fromItemId);
    const toItem = getItemById(toItemId);
    if (!fromItem || !toItem) return null;

    const fromAnchor = fromPoint
      ? getConnectionPoint(fromItem, fromPoint)
      : getAnchorPoint(fromItem, getItemCenter(toItem));
    const toAnchor = toPoint ? getConnectionPoint(toItem, toPoint) : getAnchorPoint(toItem, fromAnchor);
    return { from: fromAnchor, to: toAnchor };
  };

  const calculatePathFromPoints = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const safeDistance = distance || 1;

    const offsetX = (-dy / safeDistance) * 30;
    const offsetY = (dx / safeDistance) * 30;

    const controlX = midX + offsetX;
    const controlY = midY + offsetY;

    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  };

  return (
    <svg className="board-links-svg" style={{ pointerEvents: 'none' }}>
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#dc2626" />
        </marker>
      </defs>
      {links.map((link) => {
        const points = getLinkPoints(link.from_item, link.to_item, link.from_point, link.to_point);
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
              markerEnd="url(#arrowhead)"
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
              : draftLink.from_point
                ? getConnectionPoint(fromItem as BoardItem, draftLink.from_point)
                : getAnchorPoint(fromItem as BoardItem, targetPoint);

          return (
            <path
              d={calculatePathFromPoints(fromPoint, targetPoint)}
              stroke="#ef4444"
              strokeWidth="2.5"
              fill="none"
              markerEnd="url(#arrowhead)"
              className="board-link-path draft"
            />
          );
        })()
      )}
    </svg>
  );
};

export default BoardLinks;
