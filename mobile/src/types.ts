export interface TimelineItem {
  type: 'calendar' | 'occurrence' | 'flex';
  id: string;
  title: string;
  start?: Date;
  end?: Date;
  pinned?: boolean;
  moveable?: boolean;
  status?: string;
  attentionMode?: string;
  estimatedMinutes?: number;
  listName?: string;
  streamColor?: string;
  isInbox?: boolean;
  location?: string;
  hard?: boolean;
  mode?: string;
  dueAt?: Date;
}

export interface CompletedItem {
  type: 'occurrence' | 'flex';
  id: string;
  title: string;
  completedAt: string;
  listName: string;
  streamColor?: string;
  isInbox?: boolean;
}

export interface Stream {
  id: string;
  name: string;
  color: string;
}

export interface MyDayData {
  date: Date;
  timeline: TimelineItem[];
  completed: CompletedItem[];
  streams: Stream[];
}
