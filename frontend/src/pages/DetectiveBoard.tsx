import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth.service';
import ProtectedModule from '../components/ProtectedModule';
import BoardItem from '../components/BoardItem';
import BoardLinks from '../components/BoardLinks';
import {
  boardApi,
  type BoardItem as BoardItemType,
  type BoardLink as BoardLinkType,
  type CreateBoardItemRequest,
} from '../services/board.api';
import './DetectiveBoard.css';

const DetectiveBoard = () => {
  const [searchParams] = useSearchParams();
  const caseId = searchParams.get('caseId');
  const [items, setItems] = useState<BoardItemType[]>([]);
  const [links, setLinks] = useState<BoardLinkType[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);

  // Load board data
  useEffect(() => {
    if (!caseId) return;
    loadBoardData();
  }, [caseId]);

  const loadBoardData = async () => {
    if (!caseId) {
      setError('لطفاً یک پرونده را انتخاب کنید');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [itemsData, linksData] = await Promise.all([
        boardApi.getBoardItems(parseInt(caseId)),
        boardApi.getBoardLinks(parseInt(caseId)),
      ]);
      console.log('=== Board Data Loaded ===');
      console.log('Items:', itemsData);
      console.log('Items count:', itemsData.length);
      console.log('Links:', linksData);
      console.log('=======================');
      setItems(itemsData);
      setLinks(linksData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'خطا در بارگذاری تخته کارآگاه');
      console.error('Failed to load board:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (itemType: 'note' | 'evidence' | 'witness' | 'suspect') => {
    if (!caseId) return;

    if (itemType === 'note' && !newNoteText.trim()) {
      alert('لطفاً متن یادداشت را وارد کنید');
      return;
    }

    const newItem: CreateBoardItemRequest = {
      item_type: itemType,
      position_x: 100 + Math.random() * 200,
      position_y: 100 + Math.random() * 200,
      width: 300,
      height: 160,
    };

    if (itemType === 'note') {
      newItem.note_text = newNoteText;
    }

    try {
      const created = await boardApi.createBoardItem(parseInt(caseId), newItem);
      setItems([...items, created]);
      setNewNoteText('');
      setShowAddMenu(false);
    } catch (err: any) {
      console.error('=== Error Details ===');
      console.error('Full error:', err);
      console.error('Error response:', err.response);
      console.error('Error data:', err.data);
      console.error('Error detail:', err.detail);
      console.error('Error status:', err.status);
      console.error('Request data:', newItem);
      console.error('===================');
      
      // The error is transformed by ErrorHandler, so access data from the ApiError object
      const errorData = err.data || err.response?.data;
      let errorMsg = 'خطا در ایجاد آیتم';
      
      if (errorData) {
        if (typeof errorData === 'string') {
          errorMsg = errorData;
        } else if (errorData.detail) {
          errorMsg = errorData.detail;
        } else {
          // Show all validation errors
          const errors = Object.entries(errorData)
            .map(([field, messages]) => {
              if (Array.isArray(messages)) {
                return `${field}: ${messages.join(', ')}`;
              }
              return `${field}: ${messages}`;
            })
            .join('\n');
          errorMsg = errors || JSON.stringify(errorData, null, 2);
        }
      }
      
      alert(`خطا: ${errorMsg}`);
    }
  };

  const handleUpdateItemPosition = async (id: number, position: { x: number; y: number }) => {
    try {
      const updated = await boardApi.updateBoardItem(id, {
        position_x: position.x,
        position_y: position.y,
      });
      setItems(items.map((item) => (item.id === id ? updated : item)));
    } catch (err: any) {
      console.error('Failed to update item:', err);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('آیا از حذف این آیتم اطمینان دارید؟')) return;

    try {
      await boardApi.deleteBoardItem(id);
      setItems(items.filter((item) => item.id !== id));
      // Remove associated links
      setLinks(links.filter((link) => link.from_item !== id && link.to_item !== id));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'خطا در حذف آیتم');
    }
  };

  const handleSelectItem = (id: number) => {
    if (connectingFromId === null) {
      setSelectedItemId(id);
    } else {
      // Create connection
      handleCreateLink(connectingFromId, id);
    }
  };

  const handleStartConnection = () => {
    if (selectedItemId) {
      setConnectingFromId(selectedItemId);
    }
  };

  const handleCancelConnection = () => {
    setConnectingFromId(null);
  };

  const handleCreateLink = async (fromId: number, toId: number) => {
    if (!caseId || fromId === toId) {
      setConnectingFromId(null);
      return;
    }

    try {
      const created = await boardApi.createBoardLink(parseInt(caseId), {
        from_item: fromId,
        to_item: toId,
      });
      setLinks([...links, created]);
      setConnectingFromId(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'خطا در ایجاد اتصال');
      setConnectingFromId(null);
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    try {
      await boardApi.deleteBoardLink(linkId);
      setLinks(links.filter((link) => link.id !== linkId));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'خطا در حذف اتصال');
    }
  };

  const handleExportImage = async () => {
    if (!boardRef.current) return;

    try {
      // Try to use html2canvas if available
      const html2canvas = (window as any).html2canvas;
      if (html2canvas) {
        const canvas = await html2canvas(boardRef.current, {
          backgroundColor: '#f3f4f6',
          scale: 2,
        });
        const link = document.createElement('a');
        link.download = `detective-board-case-${caseId}-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
      } else {
        alert('برای استفاده از این قابلیت، لطفاً کتابخانه html2canvas را نصب کنید:\nnpm install html2canvas');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('خطا در خروجی گرفتن از تخته');
    }
  };

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.1, 2));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.1, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  if (!caseId) {
    return (
      <ProtectedModule moduleId="detective-board">
        <div className="detective-board-container">
          <div className="no-case-selected">
            <h2>⚠️ پرونده‌ای انتخاب نشده</h2>
            <p>لطفاً یک پرونده را انتخاب کنید تا تخته کارآگاه نمایش داده شود.</p>
            <p className="help-text">
              از طریق آدرس URL پارامتر caseId را اضافه کنید:
              <code>?caseId=1</code>
            </p>
          </div>
        </div>
      </ProtectedModule>
    );
  }

  return (
    <ProtectedModule moduleId="detective-board">
      <div className="detective-board-container">
        <div className="board-header">
          <h1>🔍 تخته کارآگاه - پرونده #{caseId}</h1>
          
          <div className="board-actions">
            <button onClick={() => setShowAddMenu(!showAddMenu)} className="btn btn-primary">
              ➕ افزودن آیتم
            </button>
            
            {selectedItemId && !connectingFromId && (
              <button onClick={handleStartConnection} className="btn btn-secondary">
                🔗 ایجاد اتصال
              </button>
            )}
            
            {connectingFromId && (
              <button onClick={handleCancelConnection} className="btn btn-danger">
                ✖ لغو اتصال
              </button>
            )}
            
            <button onClick={handleExportImage} className="btn btn-success">
              📷 خروجی تصویری
            </button>
            
            <button onClick={loadBoardData} className="btn btn-secondary" disabled={loading}>
              🔄 {loading ? 'در حال بارگذاری...' : 'بارگذاری مجدد'}
            </button>

            <div className="zoom-controls">
              <button onClick={handleZoomOut} className="btn btn-icon" title="کوچک‌نمایی">
                −
              </button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
              <button onClick={handleZoomIn} className="btn btn-icon" title="بزرگ‌نمایی">
                +
              </button>
              <button onClick={handleResetZoom} className="btn btn-icon" title="بازنشانی">
                ⟲
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {showAddMenu && (
          <div className="add-item-menu">
            <h3>افزودن آیتم جدید:</h3>
            <div className="add-item-options">
              <div className="add-item-option">
                <label>یادداشت:</label>
                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="متن یادداشت را وارد کنید..."
                  rows={3}
                />
                <button onClick={() => handleAddItem('note')} className="btn btn-sm btn-primary">
                  ➕ افزودن یادداشت
                </button>
              </div>
              
              <div className="disabled-options">
                <p style={{ fontSize: '0.9rem', color: '#666', margin: '10px 0' }}>
                  ⚠️ برای افزودن مدرک، شاهد یا مظنون، ابتدا باید آن‌ها را انتخاب کنید. این قابلیت به زودی اضافه می‌شود.
                </p>
                <button disabled className="btn btn-sm btn-secondary" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  🔍 افزودن مدرک (به زودی)
                </button>
                
                <button disabled className="btn btn-sm btn-secondary" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  👤 افزودن شاهد (به زودی)
                </button>
                
                <button disabled className="btn btn-sm btn-secondary" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  🔴 افزودن مظنون (به زودی)
                </button>
              </div>
            </div>
          </div>
        )}

        {connectingFromId && (
          <div className="connection-hint">
            🔗 اتصال در حال ایجاد... آیتم مقصد را انتخاب کنید
          </div>
        )}

        <div className="board-wrapper">
          <div
            ref={boardRef}
            className="board-canvas"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <BoardLinks
              links={links}
              items={items}
              scale={scale}
              onDeleteLink={handleDeleteLink}
            />
            
            {console.log('Rendering items:', items.length, items)}
            {items.map((item) => {
              console.log('Rendering item:', item.id, item);
              return (
                <BoardItem
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdateItemPosition}
                  onDelete={handleDeleteItem}
                  onSelect={handleSelectItem}
                  isSelected={item.id === selectedItemId}
                  scale={scale}
                />
              );
            })}

            {items.length === 0 && !loading && (
              <div className="empty-board">
                <p>تخته خالی است. از دکمه "افزودن آیتم" برای شروع استفاده کنید.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedModule>
  );
};

export default DetectiveBoard;
