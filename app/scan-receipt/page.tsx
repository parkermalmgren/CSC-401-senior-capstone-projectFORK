// app/scan-receipt/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Get API base URL dynamically - use the same host as the current page but port 8000
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('Detected hostname:', hostname);
    
    // If using IP address (not localhost), use same IP for API
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Make sure we have a complete IP address (4 parts)
      const ipParts = hostname.split('.');
      console.log('IP parts:', ipParts);
      
      if (ipParts.length === 4) {
        const apiUrl = `http://${hostname}:8000`;
        console.log('Using API URL:', apiUrl);
        return apiUrl;
      } else {
        console.warn('Incomplete IP address detected:', hostname);
      }
    }
    return "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
};

export default function ScanReceiptPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("http://localhost:8000");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Get API URL dynamically when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const url = getApiBaseUrl();
      setApiBaseUrl(url);
      console.log('Current hostname:', hostname);
      console.log('API Base URL set to:', url);
      console.log('Full URL:', window.location.href);
      
      // Test if backend is accessible
      fetch(`${url}/health`)
        .then(res => res.json())
        .then(data => {
          console.log('Backend health check successful:', data);
        })
        .catch(err => {
          console.error('Backend health check failed:', err);
          setUploadStatus(`Warning: Cannot reach backend at ${url}. Make sure it's running and accessible.`);
        });
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUploadStatus("Invalid scan link. Please scan the QR code again.");
    }
  }, [token]);

  const startCamera = async () => {
    try {
      // Check if MediaDevices API is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported in this browser. Please use a modern browser or access via HTTPS.');
      }
      
      // Use modern API with rear camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } } // Use back camera on mobile
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      
      // Provide specific error messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setUploadStatus('Camera permission denied. Please allow camera access in your browser settings and try again.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setUploadStatus('No camera found on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setUploadStatus('Camera is already in use by another application. Please close other apps using the camera.');
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        // Try without facingMode constraint
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setIsCameraActive(true);
          }
        } catch (fallbackError: any) {
          setUploadStatus('Unable to access camera. Your browser may require HTTPS for camera access.');
        }
      } else {
        setUploadStatus('Unable to access camera. Please ensure you are using HTTPS or try a different browser.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setCapturedPhoto(reader.result as string);
            stopCamera();
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const uploadPhoto = async () => {
    if (!capturedPhoto || !token) return;

    setIsUploading(true);
    setUploadStatus(null);

    try {
      // Convert data URL to blob
      const dataUrl = capturedPhoto;
      const base64Data = dataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      const file = new File([blob], 'receipt.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      // Get API URL dynamically to ensure we use the current hostname
      // Use the state variable which is set on mount, or get it fresh
      const currentApiUrl = apiBaseUrl || getApiBaseUrl();
      const uploadUrl = `${currentApiUrl}/api/receipt/scan-mobile?token=${token}`;
      console.log('Uploading to:', uploadUrl);
      console.log('API Base URL:', currentApiUrl);
      console.log('File size:', file.size, 'bytes');
      console.log('Current hostname:', typeof window !== 'undefined' ? window.location.hostname : 'N/A');
      console.log('Full location:', typeof window !== 'undefined' ? window.location.href : 'N/A');
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - let browser set it with boundary for FormData
      });

      console.log('Upload response status:', uploadResponse.status);
      console.log('Upload response headers:', Object.fromEntries(uploadResponse.headers.entries()));

      if (!uploadResponse.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await uploadResponse.text();
          console.error('Error response body:', errorText);
        } catch (e) {
          errorText = `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
          console.error('Could not read error response:', e);
        }
        console.error('Upload failed:', uploadResponse.status, errorText);
        
        if (uploadResponse.status === 0) {
          // Network error - connection failed
          const currentApiUrl = apiBaseUrl || getApiBaseUrl();
          throw new Error(`Network error: Cannot connect to server at ${currentApiUrl}. Check your connection and firewall settings.`);
        } else if (uploadResponse.status === 404) {
          // Check if it's an invalid token or endpoint not found
          if (errorText.includes('Invalid scan token') || errorText.includes('token')) {
            throw new Error(`Invalid or expired scan token. Please scan the QR code again to get a new token.`);
          } else {
            throw new Error(`Endpoint not found. The API endpoint may have changed.`);
          }
        } else if (uploadResponse.status === 403 || uploadResponse.status === 401) {
          throw new Error(`Access denied (${uploadResponse.status}). The scan token may have expired. Please scan the QR code again.`);
        } else if (uploadResponse.status === 500) {
          throw new Error(`Server error: ${errorText}. The backend may have encountered an error processing your receipt.`);
        } else {
          throw new Error(`Upload failed (${uploadResponse.status}): ${errorText}`);
        }
      }

      const data = await uploadResponse.json();
      console.log('Upload successful:', data);
      setUploadStatus('Receipt uploaded successfully! You can close this page.');
      
      // Clear photo after successful upload
      setTimeout(() => {
        setCapturedPhoto(null);
      }, 2000);
    } catch (error) {
      console.error('Error uploading receipt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadStatus(`Failed to upload receipt: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
          <h1 className="text-2xl font-semibold mb-4">Invalid Scan Link</h1>
          <p className="text-slate-600">Please scan the QR code from the website to scan your receipt.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold text-center mb-6 mt-4">Scan Receipt</h1>

        {!capturedPhoto ? (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            {!isCameraActive ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-6xl mb-4">📷</div>
                  <p className="text-slate-600 mb-4">Take a photo of your receipt</p>
                  
                  {/* Mobile-friendly file input with camera capture */}
                  <div>
                    <label className="block w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium cursor-pointer text-center">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCapturedPhoto(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                      Take Photo
                    </label>
                    <p className="text-xs text-slate-500 mt-2">This will open your phone's camera</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-96 object-cover"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={stopCamera}
                    className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Capture
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="space-y-3">
              <img 
                src={capturedPhoto} 
                alt="Captured receipt" 
                className="w-full rounded-lg border-2 border-slate-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCapturedPhoto(null);
                    stopCamera();
                  }}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Retake
                </button>
                <button
                  onClick={uploadPhoto}
                  disabled={isUploading}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? "Uploading..." : "Upload Receipt"}
                </button>
              </div>
              {uploadStatus && (
                <div className={`p-3 rounded-lg text-sm ${
                  uploadStatus.includes('success') 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-red-50 text-red-700'
                }`}>
                  {uploadStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

