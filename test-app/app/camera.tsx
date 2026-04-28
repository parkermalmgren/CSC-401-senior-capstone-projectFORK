import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useState, useRef, useEffect } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Image, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { API_BASE_URL } from '../constants/Config';

export default function CameraScreen() {
  const router = useRouter();
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to use the camera</Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setPhoto(photo?.uri || null);
    }
  };

  const uploadPhoto = async () => {
    if (!photo) return;

    setUploading(true);
    try {
      const API_URL = API_BASE_URL;
      
      // Get auth token from AsyncStorage
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        alert('Not logged in. Please log in first.');
        setUploading(false);
        return;
      }
      
      const formData = new FormData();
      formData.append('file', {
        uri: photo,
        type: 'image/jpeg',
        name: 'receipt.jpg',
      } as any);

      const response = await fetch(`${API_URL}/api/receipt/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(`Receipt scanned! Found ${data.items?.length || 0} items`);
        setPhoto(null);
        router.back();
      } else {
        alert(`Failed: ${data.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading receipt: ' + error);
    } finally {
      setUploading(false);
    }
  };

  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo }} style={styles.preview} />
        {uploading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Uploading receipt...</Text>
          </View>
        )}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, uploading && styles.buttonDisabled]} 
            onPress={() => setPhoto(null)}
            disabled={uploading}
          >
            <Text style={styles.text}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, uploading && styles.buttonDisabled]} 
            onPress={uploadPhoto}
            disabled={uploading}
          >
            <Text style={styles.text}>{uploading ? 'Uploading...' : 'Upload'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={takePicture}>
            <Text style={styles.text}>Take Photo</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    margin: 64,
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    margin: 5,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  preview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
});
