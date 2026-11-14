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
  const streamColor = item.streamColor || '#999';

  return (
    <View style={styles.item}>
      <View style={[styles.indicator, { backgroundColor: streamColor }]} />
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
  const streamColor = item.streamColor || '#999';

  return (
    <View style={styles.completedItem}>
      <View style={[styles.indicator, { backgroundColor: streamColor }]} />
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
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  completedItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    opacity: 0.7,
  },
  indicator: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
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
    color: '#333',
    flex: 1,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
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
    color: '#666',
  },
  streamName: {
    fontWeight: '600',
  },
  location: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
});
