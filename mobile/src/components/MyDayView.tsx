import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import type { MyDayData } from '../types';

interface MyDayViewProps {
  data: MyDayData;
}

export function MyDayView({ data }: MyDayViewProps) {
  const sortedTimeline = [...data.timeline].sort((a, b) => {
    const aTime = a.start?.getTime() || 0;
    const bTime = b.start?.getTime() || 0;
    return aTime - bTime;
  });

  return (
    <View style={styles.container}>
      {sortedTimeline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {sortedTimeline.map((item) => (
            <TimelineItemView key={`${item.type}-${item.id}`} item={item} />
          ))}
        </View>
      )}

      {data.completed.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Completed ({data.completed.length})
          </Text>
          {data.completed.map((item) => (
            <CompletedItemView key={`${item.type}-${item.id}`} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

function TimelineItemView({ item }: { item: any }) {
  const streamColor = item.streamColor || '#c9c3b4';
  const itemStyle = item.hard 
    ? [styles.item, { 
        borderLeftColor: '#b45309', // --hard
        backgroundColor: '#fde68a', // --hard-soft
      }]
    : item.type === 'calendar'
    ? [styles.item, {
        borderLeftColor: '#1e3a5f', // --locked
        backgroundColor: '#dbe7f3', // --locked-soft
      }]
    : [styles.item, { borderLeftColor: streamColor }];

  return (
    <View style={itemStyle}>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {item.pinned && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>📌</Text>
            </View>
          )}
          {item.hard && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🔒</Text>
            </View>
          )}
        </View>

        <View style={styles.itemMeta}>
          {item.start && item.end && (
            <Text style={styles.metaText}>
              {format(item.start, 'h:mm a')} - {format(item.end, 'h:mm a')}
            </Text>
          )}
          {item.estimatedMinutes && (
            <Text style={styles.metaText}>
              {item.estimatedMinutes} min
            </Text>
          )}
          {item.listName && (
            <Text style={[styles.metaText, styles.streamName]}>
              {item.listName}
            </Text>
          )}
        </View>

        {item.location && (
          <Text style={styles.location}>📍 {item.location}</Text>
        )}
      </View>
    </View>
  );
}

function CompletedItemView({ item }: { item: any }) {
  return (
    <View style={styles.completedItem}>
      <View style={styles.itemContent}>
        <Text style={styles.completedTitle}>✓ {item.title}</Text>
        <View style={styles.itemMeta}>
          {item.listName && (
            <Text style={[styles.metaText, styles.streamName]}>
              {item.listName}
            </Text>
          )}
          <Text style={styles.metaText}>
            {format(new Date(item.completedAt), 'h:mm a')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1f1c', // --ink
    marginBottom: 12,
  },
  item: {
    backgroundColor: '#e8e4d9', // --paper-2
    borderRadius: 2,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: '#c9c3b4', // --line
  },
  completedItem: {
    backgroundColor: '#d5e8dc', // --accent-soft (with opacity)
    borderRadius: 2,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: '#166534', // --ok
    opacity: 0.7,
  },
  indicator: {
    width: 0, // Using borderLeftWidth instead
    borderRadius: 0,
    marginRight: 0,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1f1c', // --ink
    flex: 1,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#5c635c', // --muted
    marginBottom: 8,
    textDecorationLine: 'line-through',
  },
  badge: {
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 14,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaText: {
    fontSize: 14,
    color: '#5c635c', // --muted
  },
  streamName: {
    fontWeight: '600',
  },
  location: {
    fontSize: 14,
    color: '#5c635c', // --muted
    marginTop: 8,
  },
});
