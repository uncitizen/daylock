import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { format } from 'date-fns';
import { MyDayService } from './src/services/myDayService';
import { MyDayView } from './src/components/MyDayView';
import type { MyDayData } from './src/types';

export default function App() {
  const [myDayData, setMyDayData] = useState<MyDayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const savedUrl = await SecureStore.getItemAsync('apiUrl');
      const savedKey = await SecureStore.getItemAsync('apiKey');
      
      if (savedUrl && savedKey) {
        setApiUrl(savedUrl);
        setApiKey(savedKey);
        setIsConfigured(true);
        await loadMyDay(savedUrl, savedKey);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      await SecureStore.setItemAsync('apiUrl', apiUrl);
      await SecureStore.setItemAsync('apiKey', apiKey);
      setIsConfigured(true);
      await loadMyDay(apiUrl, apiKey);
    } catch (err) {
      setError('Failed to save configuration');
    }
  };

  const loadMyDay = async (url: string, key: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const service = new MyDayService(url, key);
      const data = await service.getMyDay(new Date());
      setMyDayData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load My Day');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    if (apiUrl && apiKey) {
      await loadMyDay(apiUrl, apiKey);
    }
  };

  if (!isConfigured) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.configContainer}>
          <Text style={styles.title}>Daylock Setup</Text>
          <Text style={styles.subtitle}>
            Connect to your Daylock instance
          </Text>

          <TextInput
            style={styles.input}
            placeholder="API URL (e.g., https://your-daylock.com)"
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="API Key"
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={styles.button}
            onPress={saveConfig}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>
            Get your API key from your Daylock instance settings
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Day</Text>
          <Text style={styles.headerDate}>
            {format(new Date(), 'EEEE, MMMM d')}
          </Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        {myDayData && <MyDayView data={myDayData} />}

        {!myDayData && !isLoading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks for today</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f0e8', // --paper
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#f3f0e8', // --paper
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    borderBottomWidth: 1,
    borderBottomColor: '#c9c3b4', // --line
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1a1f1c', // --ink
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerDate: {
    fontSize: 16,
    color: '#5c635c', // --muted
    marginTop: 4,
  },
  configContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f3f0e8', // --paper
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1a1f1c', // --ink
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  subtitle: {
    fontSize: 16,
    color: '#5c635c', // --muted
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f3f0e8', // --paper
    borderWidth: 1,
    borderColor: '#c9c3b4', // --line
    borderRadius: 4,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    color: '#1a1f1c', // --ink
  },
  button: {
    backgroundColor: '#1a1f1c', // --ink
    borderRadius: 4,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#f3f0e8', // --paper
    fontSize: 18,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 14,
    color: '#5c635c', // --muted
    textAlign: 'center',
    marginTop: 16,
  },
  error: {
    color: '#9f1239', // --danger
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#fde0e6',
    padding: 12,
    margin: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f5a3b8',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#5c635c', // --muted
  },
});
