  // components/ReceiptScannerModal.tsx
  "use client";

  import { useState, useRef, useEffect, useCallback } from "react";
  import { QRCodeSVG } from "qrcode.react";
  import { getAuthToken } from "@/lib/api";

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  interface ReceiptScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onItemsAdded?: (items: any[]) => void;
  }

  export default function ReceiptScannerModal({ isOpen, onClose, onItemsAdded }: ReceiptScannerModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanToken, setScanToken] = useState<string | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [localIp, setLocalIp] = useState<string | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Get local IP address for mobile access
    useEffect(() => {
      if (typeof window !== 'undefined' && !localIp) {
        // Check if we're already using an IP address (not localhost)
        const currentHost = window.location.hostname;
        if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
          // Already using IP, use it
          setLocalIp(currentHost);
          return;
        }

        // Try to get local IP via WebRTC (works in most browsers)
        const RTCPeerConnection = window.RTCPeerConnection ||
          (window as any).webkitRTCPeerConnection ||
          (window as any).mozRTCPeerConnection;

        if (RTCPeerConnection) {
          const pc = new RTCPeerConnection({ iceServers: [] });
          pc.createDataChannel('');
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              const candidate = event.candidate.candidate;
              const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
              if (match && match[1] && !match[1].startsWith('127.')) {
                setLocalIp(match[1]);
                pc.close();
              }
            }
          };
          pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {
            pc.close();
          });
        }
      }
    }, [localIp]);

    const stopPolling = useCallback(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setIsPolling(false);
    }, []);

    const updateQrCodeUrl = useCallback((token: string, ipOverride?: string) => {
      let baseUrl = 'http://localhost:3000';
      if (typeof window !== 'undefined') {
        const currentHost = window.location.hostname;
        const currentPort = window.location.port || '3000';

        const ipToUse = ipOverride || localIp;

        if (ipToUse && /^(\d{1,3}\.){3}\d{1,3}$/.test(ipToUse)) {
          // Use provided IP address
          baseUrl = `http://${ipToUse}:${currentPort}`;
        } else if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
          // Already using IP address
          baseUrl = window.location.origin;
        } else {
          // Using localhost - need IP for mobile access
          baseUrl = `http://YOUR_IP:${currentPort}`;
        }
      }
      const scanUrl = `${baseUrl}/scan-receipt?token=${token}`;
      setQrCodeUrl(scanUrl);
    }, [localIp]);

    const startPolling = useCallback((token: string) => {
      setIsPolling(true);

      const poll = async () => {
        try {
          const sessionToken = await getAuthToken();

          const response = await fetch(`${API_BASE_URL}/api/receipt/scan-result/${token}`, {
            headers: {
              'Authorization': `Bearer ${sessionToken}`
            }
          });

          if (response.ok) {
            const data = await response.json();

            if (data.status === 'completed' && data.result) {
              stopPolling();
              setIsPolling(false);

              const items = data.result.items || [];

              // Call callback to refresh items list
              if (onItemsAdded && items.length > 0) {
                onItemsAdded(items);
              }

              alert(`Found ${items.length} items:\n${items.map((item: any) => `- ${item.name} (${item.quantity})`).join('\n')}`);

              onClose();
            } else if (data.status === 'error') {
              stopPolling();
              setIsPolling(false);
              alert('Error scanning receipt. Please try again.');
            }
          }
        } catch (error) {
          console.error('Error polling for scan result:', error);
        }
      };

      // Poll every 2 seconds
      pollingIntervalRef.current = setInterval(poll, 2000);
    }, [stopPolling, onClose]);

    const createScanSession = useCallback(async () => {
      try {
        const token = await getAuthToken();

        const response = await fetch(`${API_BASE_URL}/api/receipt/create-session`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          let errorMessage = 'Failed to create scan session';
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } catch {
            if (response.status === 429) {
              errorMessage = 'Too many scan session requests. Please wait a moment before trying again.';
            }
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const newToken = data.token;
        setScanToken(newToken);

        // Generate QR code URL - will be updated when localIp is available
        updateQrCodeUrl(newToken);

        // Start polling for results
        startPolling(newToken);
      } catch (error) {
        console.error('Error creating scan session:', error);
        alert('Failed to create scan session. Please try again.');
      }
    }, [startPolling, updateQrCodeUrl]);

    // Update QR code when IP changes
    useEffect(() => {
      if (scanToken && localIp) {
        updateQrCodeUrl(scanToken);
      }
    }, [localIp, scanToken, updateQrCodeUrl]);

    // Create scan session and generate QR code when modal opens
    useEffect(() => {
      if (isOpen && !scanToken) {
        createScanSession();
      }
      return () => {
        stopPolling();
      };
    }, [isOpen, scanToken, createScanSession, stopPolling]);

    // Don't render anything if modal is closed, but do this AFTER all hooks
    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

    const handleScan = async () => {
      if (!selectedFile) return;

      setIsScanning(true);

      try{
        const token = await getAuthToken();

        const formData = new FormData();
        formData.append('file', selectedFile);

        // sending to backend
        const response = await fetch(`${API_BASE_URL}/api/receipt/scan`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          // Try to get error message from response
          let errorMessage = 'Failed to scan receipt';
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } catch {
            // If response isn't JSON, check for rate limiting
            if (response.status === 429) {
              errorMessage = 'Too many receipt scans. Please wait a moment before scanning another receipt.';
            } else {
              errorMessage = response.statusText || errorMessage;
            }
          }
          throw new Error(errorMessage);
        }

        const data = await response.json()
        console.log('Scanned items:', data.items);

        // Call callback to refresh items list
        if (onItemsAdded && data.items) {
          onItemsAdded(data.items);
        }

        alert(`Found ${data.items.length} items:\n${data.items.map((item: any) => `- ${item.name} (${item.quantity})`).join('\n')}`);

        onClose();
      } catch (error) {
        console.error('Error scanning receipt:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to scan receipt. Please try again.';
        alert(errorMessage);
      } finally {
        setIsScanning(false);
      }
    };

    const handleClose = () => {
      setSelectedFile(null);
      setPreview(null);
      setScanToken(null);
      setQrCodeUrl(null);
      stopPolling();
      onClose();
    };


    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-label="Scan receipt"
      >
        <div
          className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 p-6 pb-0 flex-shrink-0">
            <h2 className="text-xl font-semibold">Scan Receipt</h2>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
            {/* Upload Section */}
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
              {preview ? (
                <div className="space-y-3">
                  <img src={preview} alt="Receipt preview" className="max-h-48 mx-auto rounded" />
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreview(null);
                    }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Choose different image
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-4xl">📄</div>
                  <p className="text-sm text-slate-600">Upload a receipt image</p>
                  <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                    Choose File
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* QR Code Section */}
            <div className="border border-slate-300 rounded-lg p-6 bg-slate-50">
              <div className="text-center space-y-4">
                <div className="text-2xl">📷</div>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Scan with Your Phone</p>
                  <p className="text-xs text-slate-500 mb-2">Scan this QR code with your phone to take a photo of your receipt</p>
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-left">
                    <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Need to set your IP address</p>
                    <p className="text-xs text-yellow-700 mb-2">Enter your computer's local IP address so your phone can connect:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="192.168.1.xxx"
                        value={localIp || ''}
                        onChange={(e) => {
                          const newIp = e.target.value.trim();
                          setLocalIp(newIp);
                          // Auto-update QR code when valid IP is entered
                          if (newIp && scanToken && /^(\d{1,3}\.){3}\d{1,3}$/.test(newIp)) {
                            updateQrCodeUrl(scanToken, newIp);
                          }
                        }}
                        className="flex-1 px-2 py-1 text-xs border border-yellow-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                      <button
                        onClick={() => {
                          if (localIp && scanToken && /^(\d{1,3}\.){3}\d{1,3}$/.test(localIp)) {
                            updateQrCodeUrl(scanToken, localIp);
                          }
                        }}
                        disabled={!localIp || !scanToken || !/^(\d{1,3}\.){3}\d{1,3}$/.test(localIp)}
                        className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Update
                      </button>
                    </div>
                    <p className="text-xs text-yellow-600 mt-2">
                      Find it: Windows: <code className="bg-yellow-100 px-1 rounded">ipconfig</code> | Mac/Linux: <code className="bg-yellow-100 px-1 rounded">ifconfig</code>
                    </p>
                    {localIp && !/^(\d{1,3}\.){3}\d{1,3}$/.test(localIp) && (
                      <p className="text-xs text-red-600 mt-1">⚠️ Please enter a valid IP address (e.g., 192.168.1.100)</p>
                    )}
                  </div>
                </div>
                {qrCodeUrl && !qrCodeUrl.includes('YOUR_IP') && localIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(localIp) ? (
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG value={qrCodeUrl} size={200} />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg w-[200px] h-[200px] flex items-center justify-center">
                      <p className="text-sm text-slate-400 text-center">Enter IP address above</p>
                    </div>
                  </div>
                )}
                {isPolling && (
                  <p className="text-xs text-blue-600 mt-2">Waiting for receipt scan...</p>
                )}
              </div>
            </div>

          </div>

          {/* Action Buttons - fixed at bottom */}
          <div className="flex gap-2 p-6 pt-0 flex-shrink-0 border-t border-slate-100">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              disabled={isScanning}
            >
              Cancel
            </button>
            <button
              onClick={handleScan}
              disabled={!selectedFile || isScanning}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? "Scanning..." : "Scan Receipt"}
            </button>
          </div>
        </div>
      </div>
    );
  }
