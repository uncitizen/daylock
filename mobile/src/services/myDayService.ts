import { format } from 'date-fns';
import type { MyDayData } from '../types';

export class MyDayService {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async getMyDay(date: Date): Promise<MyDayData> {
    const dateStr = format(date, 'yyyy-MM-dd');
    const response = await fetch(
      `${this.apiUrl}/api/v1/my-day?date=${dateStr}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch My Day: ${response.status}`);
    }

    const data = await response.json();
    return {
      date: new Date(data.date),
      timeline: data.timeline.map((item: any) => ({
        ...item,
        start: item.start ? new Date(item.start) : undefined,
        end: item.end ? new Date(item.end) : undefined,
        dueAt: item.dueAt ? new Date(item.dueAt) : undefined,
      })),
      completed: data.completed,
      streams: data.streams,
    };
  }
}
