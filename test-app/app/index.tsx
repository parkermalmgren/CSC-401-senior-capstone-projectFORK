import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';

import { WEB_VIEW_URL } from '../constants/Config';

export default function Index() {
  const router = useRouter();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const currentUrl = WEB_VIEW_URL;

  return (
    <View style={[styles.container, { backgroundColor: '#333' }]}>
      <StatusBar style="light" />
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: '#333' }]}>
          <Text style={[styles.errorTitle, { color: '#f8fafc' }]}>⚠️ Connection Error</Text>
          <Text style={[styles.errorText, { color: '#94a3b8' }]}>{error}</Text>
          <Text style={[styles.errorHint, { color: '#64748b' }]}>Make sure you have internet connection</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setIsLoading(true);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView 
        source={{ uri: currentUrl }}
        style={styles.webview}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={false}
        incognito={true}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          setError(`Cannot load website: ${currentUrl}. Error: ${nativeEvent.description || 'Unknown error'}`);
          setIsLoading(false);
        }}
        injectedJavaScript={`
          (function() {
            // Extract and send auth token to React Native from cookie
            const extractToken = () => {
              const token = document.cookie
                .split('; ')
                .find(row => row.startsWith('sp_session='))
                ?.split('=')[1];
              if (token) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AUTH_TOKEN', token }));
              }
            };
            
            extractToken();
            setInterval(extractToken, 1000);
          })();
          true;
        `}
        onMessage={async (event) => {
          const data = event.nativeEvent.data;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'AUTH_TOKEN') {
              await AsyncStorage.setItem('auth_token', parsed.token);
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#f8fafc',
  },
  errorText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorHint: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
