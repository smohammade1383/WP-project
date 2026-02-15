import apiClient from './api.client';

export interface BoardItem {
  id: number;
  board: number;
  item_type: 'note' | 'evidence' | 'witness' | 'suspect';
  note_text?: string;
  evidence?: number;
  evidence_title?: string;
  user?: number;
  username?: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface BoardLink {
  id: number;
  board: number;
  from_item: number;
  to_item: number;
  from_point?: 'top' | 'right' | 'bottom' | 'left';
  to_point?: 'top' | 'right' | 'bottom' | 'left';
  description?: string;
}

export interface BoardConnection {
  id: number;
  board: number;
  from_evidence: number;
  to_evidence: number;
  description?: string;
}

export interface DetectiveBoard {
  id: number;
  case: number;
  detective: number;
  created_at: string;
  items: BoardItem[];
  links: BoardLink[];
  connections?: BoardConnection[];
}

export interface CreateBoardItemRequest {
  item_type: 'note' | 'evidence' | 'witness' | 'suspect';
  note_text?: string;
  evidence?: number;
  user?: number;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
}

export interface UpdateBoardItemRequest {
  item_type?: 'note' | 'evidence' | 'witness' | 'suspect';
  note_text?: string;
  evidence?: number;
  user?: number;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
}

export interface CreateBoardLinkRequest {
  from_item: number;
  to_item: number;
  from_point?: 'top' | 'right' | 'bottom' | 'left';
  to_point?: 'top' | 'right' | 'bottom' | 'left';
  description?: string;
}

export const boardApi = {
  // Get all board items for a case
  getBoardItems: async (caseId: number): Promise<BoardItem[]> => {
    const response = await apiClient.get(`/cases/${caseId}/board/items/`);
    return response.data;
  },

  // Create a new board item
  createBoardItem: async (caseId: number, data: CreateBoardItemRequest): Promise<BoardItem> => {
    const response = await apiClient.post(`/cases/${caseId}/board/items/`, data);
    return response.data;
  },

  // Update a board item
  updateBoardItem: async (itemId: number, data: UpdateBoardItemRequest): Promise<BoardItem> => {
    const response = await apiClient.patch(`/cases/board/items/${itemId}/`, data);
    return response.data;
  },

  // Delete a board item
  deleteBoardItem: async (itemId: number): Promise<void> => {
    await apiClient.delete(`/cases/board/items/${itemId}/`);
  },

  // Get all board links for a case
  getBoardLinks: async (caseId: number): Promise<BoardLink[]> => {
    const response = await apiClient.get(`/cases/${caseId}/board/links/`);
    return response.data;
  },

  // Create a new board link
  createBoardLink: async (caseId: number, data: CreateBoardLinkRequest): Promise<BoardLink> => {
    const response = await apiClient.post(`/cases/${caseId}/board/links/`, data);
    return response.data;
  },

  // Delete a board link
  deleteBoardLink: async (linkId: number): Promise<void> => {
    await apiClient.delete(`/cases/board/links/${linkId}/`);
  },

  // Get detective board for a case
  getDetectiveBoard: async (caseId: number): Promise<DetectiveBoard> => {
    const response = await apiClient.get(`/cases/${caseId}/board/`);
    return response.data;
  },
};
