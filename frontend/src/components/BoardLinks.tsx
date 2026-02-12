import type { BoardLink as BoardLinkType, BoardItem } from '../services/board.api';
import './BoardLinks.css';

interface BoardLinksProps {
  links: BoardLinkType[];
  items: BoardItem[];
  scale: number;
  onDeleteLink: (linkId: number) => void;
  draftLink?: { from_item: number; to_x: number; to_y: number } | null;
}

const BoardLinks = ({ links, items, onDeleteLink, draftLink }: BoardLinksProps) => {
  const getItemCenter = (itemId: number) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return { x: 0, y: 0 };

    return {
      x: item.position_x + item.width / 2,
      y: item.position_y + item.height / 2,
    };
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
        const fromPoint = getItemCenter(link.from_item);
        const toPoint = getItemCenter(link.to_item);
        const path = calculatePathFromPoints(fromPoint, toPoint);
        const midPoint = getItemCenter(link.from_item);
        const deleteX = (midPoint.x + toPoint.x) / 2;
        const deleteY = (midPoint.y + toPoint.y) / 2;

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
        <path
          d={calculatePathFromPoints(getItemCenter(draftLink.from_item), {
            x: draftLink.to_x,
            y: draftLink.to_y,
          })}
          stroke="#ef4444"
          strokeWidth="2.5"
          fill="none"
          markerEnd="url(#arrowhead)"
          className="board-link-path draft"
        />
      )}
    </svg>
  );
};

export default BoardLinks;
