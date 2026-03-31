export type TaskStatus = 'todo' | 'in-progress' | 'completed';
export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  userId: string;
  createdAt: string;
}

export interface Note {
  id?: string;
  content: string;
  userId: string;
  createdAt: string;
}

export interface Schedule {
  id?: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  userId: string;
  createdAt: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
