"use client";

import Webcam from "react-webcam";
import { useRef, useState, useEffect } from "react";
import axios from "axios";
import { 
  Camera, Upload, X, RotateCw, AlertCircle, CheckCircle, 
  Ruler, Droplets, Download, History, Trash2, Save,
  ChevronLeft, ChevronRight, Calendar, FileText
} from "lucide-react";

interface Detection {
  confidence: number;
  bbox: number[] | [number, number, number, number];
  label: string;
  width_px?: number;
  height_px?: number;
  width_µm?: number;
  height_µm?: number;
  diagonal_µm?: number;
  size_category?: string; // 'nanoplastic', 'small', 'medium', 'large'
}

interface DetectionResult {
  count: number;
  detections: Detection[];
  image_size?: [number, number];
  size_counts?: {
    nanoplastic: number;
    small: number;
    medium: number;
    large: number;
  };
  calibration_info?: {
    microns_per_pixel: number;
    field_of_view_µm: [number, number];
  };
  timestamp?: string;
  imageData?: string; // Base64 image with detections
}

interface HistoryItem {
  id: string;
  timestamp: string;
  result: DetectionResult;
  imageData: string;
  filename: string;
}

export default function CameraUI() {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<"camera" | "gallery">("camera");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(0);
  const itemsPerPage = 4;

  // Size category colors
  const sizeCategoryColors: Record<string, string> = {
    nanoplastic: 'border-red-500 bg-red-500/10 text-red-400',
    small: 'border-yellow-500 bg-yellow-500/10 text-yellow-400',
    medium: 'border-blue-500 bg-blue-500/10 text-blue-400',
    large: 'border-purple-500 bg-purple-500/10 text-purple-400',
  };

  const sizeCategoryLabels: Record<string, string> = {
    nanoplastic: 'Nanoplastic (<1µm)',
    small: 'Small (1-100µm)',
    medium: 'Medium (100-1000µm)',
    large: 'Large (1-5mm)',
  };

  // Load history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('microplasticsHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error loading history:', e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('microplasticsHistory', JSON.stringify(history));
    }
  }, [history]);

  const parseBbox = (bbox: number[] | [number, number, number, number]): [number, number, number, number] => {
    if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
      return [0, 0, 0, 0];
    }
    return [
      Number(bbox[0]) || 0,
      Number(bbox[1]) || 0,
      Number(bbox[2]) || 0,
      Number(bbox[3]) || 0,
    ];
  };

  const getSizeCategoryColor = (detection: Detection) => {
    if (detection.size_category && detection.label.toLowerCase() === 'microplastic') {
      return sizeCategoryColors[detection.size_category] || 'border-gray-500 bg-gray-500/10 text-gray-400';
    }
    
    // Fallback for non-microplastics or if no size category
    const confidence = Number(detection.confidence) || 0;
    if (confidence > 0.7) {
      return "border-green-500 bg-green-500/10 text-green-400";
    } else if (confidence > 0.4) {
      return "border-yellow-500 bg-yellow-500/10 text-yellow-400";
    } else {
      return "border-red-500 bg-red-500/10 text-red-400";
    }
  };

  const capture = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setImage(imageSrc);
    setMode("gallery");
    await sendToBackend(base64ToBlob(imageSrc), imageSrc);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    setImage(imageUrl);
    setMode("gallery");
    await sendToBackend(file);
  };

  const base64ToBlob = (base64: string): Blob => {
    try {
      const arr = base64.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      return new Blob([u8arr], { type: mime });
    } catch (error) {
      console.error('Error converting base64 to blob:', error);
      return new Blob();
    }
  };

  const saveToHistory = (result: DetectionResult, imageData: string, filename: string) => {
    const historyItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      result,
      imageData,
      filename
    };
    
    const updatedHistory = [historyItem, ...history].slice(0, 50); // Keep last 50 items
    setHistory(updatedHistory);
  };

  const sendToBackend = async (file: Blob, imageSrc?: string) => {
    setLoading(true);
    setResult(null);
    setImageDimensions(null);

    const formData = new FormData();
    formData.append("file", file, "image.jpg");

    try {
      const res = await axios.post<DetectionResult>("http://localhost:8000/detect", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      console.log("Backend response:", res.data);
      
      const processedResult: DetectionResult = {
        count: res.data.count || 0,
        detections: Array.isArray(res.data.detections) 
          ? res.data.detections.map((d: any) => ({
              confidence: Number(d.confidence) || 0,
              bbox: Array.isArray(d.bbox) ? d.bbox.map(Number) : [0, 0, 0, 0],
              label: d.label || "Microplastic",
              width_px: d.width_px ? Number(d.width_px) : undefined,
              height_px: d.height_px ? Number(d.height_px) : undefined,
              width_µm: d.width_µm ? Number(d.width_µm) : undefined,
              height_µm: d.height_µm ? Number(d.height_µm) : undefined,
              diagonal_µm: d.diagonal_µm ? Number(d.diagonal_µm) : undefined,
              size_category: d.size_category || undefined,
            }))
          : [],
        image_size: res.data.image_size,
        size_counts: res.data.size_counts || {
          nanoplastic: 0,
          small: 0,
          medium: 0,
          large: 0,
        },
        calibration_info: res.data.calibration_info,
        timestamp: new Date().toISOString(),
      };
      
      setResult(processedResult);
      
      // Save to history after a brief delay to ensure image is loaded
      setTimeout(() => {
        if (image) {
          saveToHistory(processedResult, image, `detection_${Date.now()}.jpg`);
        }
      }, 500);
      
    } catch (err) {
      console.error("Detection failed:", err);
      alert("Detection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setMode("camera");
    setImageDimensions(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setImage(item.imageData);
    setResult(item.result);
    setMode("gallery");
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
  };

  const clearAllHistory = () => {
    if (window.confirm("Are you sure you want to clear all history?")) {
      setHistory([]);
      localStorage.removeItem('microplasticsHistory');
    }
  };

  const downloadResults = () => {
    if (!result || !image) return;

    // Create CSV data
    const csvContent = [
      ['Microplastic Detection Results'],
      [`Date: ${new Date().toLocaleString()}`],
      [`Total Detections: ${result.count}`],
      [''],
      ['ID', 'Label', 'Confidence', 'Size Category', 'Diagonal (µm)', 'Width (µm)', 'Height (µm)', 'X', 'Y', 'Width', 'Height'],
      ...result.detections.map((detection, index) => [
        index + 1,
        detection.label,
        `${(detection.confidence * 100).toFixed(1)}%`,
        detection.size_category || 'N/A',
        detection.diagonal_µm?.toFixed(2) || 'N/A',
        detection.width_µm?.toFixed(2) || 'N/A',
        detection.height_µm?.toFixed(2) || 'N/A',
        detection.bbox[0].toFixed(0),
        detection.bbox[1].toFixed(0),
        detection.bbox[2].toFixed(0),
        detection.bbox[3].toFixed(0),
      ]),
      [''],
      ['Size Distribution Summary'],
      ['Category', 'Count'],
      ['Nanoplastic (<1µm)', result.size_counts?.nanoplastic || 0],
      ['Small (1-100µm)', result.size_counts?.small || 0],
      ['Medium (100-1000µm)', result.size_counts?.medium || 0],
      ['Large (1-5mm)', result.size_counts?.large || 0],
      [''],
      ['Calibration Info'],
      ['Microns per pixel:', result.calibration_info?.microns_per_pixel.toFixed(2) || 'N/A'],
      ['Field of View:', `${result.calibration_info?.field_of_view_µm[0].toFixed(0)} × ${result.calibration_info?.field_of_view_µm[1].toFixed(0)} µm`],
    ].map(row => row.join(',')).join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `microplastics_results_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    // Also download the annotated image
    const imageA = document.createElement('a');
    imageA.href = image;
    imageA.download = `microplastics_image_${Date.now()}.jpg`;
    document.body.appendChild(imageA);
    imageA.click();
    document.body.removeChild(imageA);
  };

  const downloadReportPDF = () => {
    if (!result || !image) return;

    // Create a printable report
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) return;

    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Microplastic Analysis Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .section { margin-bottom: 25px; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #2c5282; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
          .summary-item { padding: 15px; border-radius: 8px; text-align: center; }
          .nanoplastic { background-color: #fed7d7; color: #c53030; }
          .small { background-color: #fefcbf; color: #975a16; }
          .medium { background-color: #bee3f8; color: #2c5282; }
          .large { background-color: #e9d8fd; color: #553c9a; }
          .timestamp { color: #666; font-size: 14px; margin-top: 30px; }
          .image-container { text-align: center; margin: 20px 0; }
          .image-container img { max-width: 100%; max-height: 500px; border: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Microplastic Screening Analysis Report</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
          <div class="section-title">Summary Statistics</div>
          <div class="summary-grid">
            <div class="summary-item nanoplastic">
              <div style="font-size: 24px; font-weight: bold;">${result.size_counts?.nanoplastic || 0}</div>
              <div>Nanoplastic</div>
              <div style="font-size: 12px;">&lt; 1 µm</div>
            </div>
            <div class="summary-item small">
              <div style="font-size: 24px; font-weight: bold;">${result.size_counts?.small || 0}</div>
              <div>Small</div>
              <div style="font-size: 12px;">1-100 µm</div>
            </div>
            <div class="summary-item medium">
              <div style="font-size: 24px; font-weight: bold;">${result.size_counts?.medium || 0}</div>
              <div>Medium</div>
              <div style="font-size: 12px;">100-1000 µm</div>
            </div>
            <div class="summary-item large">
              <div style="font-size: 24px; font-weight: bold;">${result.size_counts?.large || 0}</div>
              <div>Large</div>
              <div style="font-size: 12px;">1-5 mm</div>
            </div>
          </div>
          <p><strong>Total Particles Detected:</strong> ${result.count}</p>
        </div>

        <div class="section">
          <div class="section-title">Detection Details</div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Label</th>
                <th>Confidence</th>
                <th>Size Category</th>
                <th>Diagonal (µm)</th>
                <th>Dimensions (µm)</th>
              </tr>
            </thead>
            <tbody>
              ${result.detections.map((detection, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${detection.label}</td>
                  <td>${(detection.confidence * 100).toFixed(1)}%</td>
                  <td>${detection.size_category || 'N/A'}</td>
                  <td>${detection.diagonal_µm?.toFixed(2) || 'N/A'}</td>
                  <td>${detection.width_µm?.toFixed(2) || 'N/A'} × ${detection.height_µm?.toFixed(2) || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Calibration Information</div>
          <p><strong>Microns per pixel:</strong> ${result.calibration_info?.microns_per_pixel.toFixed(2) || 'N/A'} µm/px</p>
          <p><strong>Field of View:</strong> ${result.calibration_info?.field_of_view_µm[0].toFixed(0) || 'N/A'} × ${result.calibration_info?.field_of_view_µm[1].toFixed(0) || 'N/A'} µm</p>
        </div>

        <div class="section">
          <div class="section-title">Annotated Image</div>
          <div class="image-container">
            <img src="${image}" alt="Microplastic Detection Results" />
          </div>
        </div>

        <div class="timestamp">
          <p>Report generated by Microplastic Screening Tool</p>
          <p>Disclaimer: This is a screening tool only. For laboratory analysis, consult with certified professionals.</p>
        </div>
      </body>
      </html>
    `;

    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
    
    // Give time for images to load, then trigger print
    setTimeout(() => {
      reportWindow.print();
    }, 1000);
  };

  const saveCurrentResult = () => {
    if (!result || !image) {
      alert("No result to save!");
      return;
    }

    const filename = `microplastics_${Date.now()}`;
    saveToHistory(result, image, filename);
    alert("Result saved to history!");
  };

  const renderBoundingBoxes = () => {
    if (!result || !imageDimensions || !image) return null;

    return result.detections.map((detection, index) => {
      const [x, y, width, height] = parseBbox(detection.bbox);
      const isNormalized = x <= 1 && y <= 1 && width <= 1 && height <= 1;
      
      let left, top, boxWidth, boxHeight;
      
      if (isNormalized) {
        left = x * imageDimensions.width;
        top = y * imageDimensions.height;
        boxWidth = width * imageDimensions.width;
        boxHeight = height * imageDimensions.height;
      } else {
        left = x;
        top = y;
        boxWidth = width;
        boxHeight = height;
      }
      
      // Calculate positions as percentages for CSS
      const leftPercent = (left / imageDimensions.width) * 100;
      const topPercent = (top / imageDimensions.height) * 100;
      const widthPercent = (boxWidth / imageDimensions.width) * 100;
      const heightPercent = (boxHeight / imageDimensions.height) * 100;

      const confidence = Number(detection.confidence) || 0;
      const confidencePercent = (confidence * 100).toFixed(1);
      
      // Get color based on size category or confidence
      const categoryColor = getSizeCategoryColor(detection);
      const borderColor = categoryColor.split(' ')[0]; // Get just the border color class
      const bgColor = categoryColor.split(' ').find(c => c.includes('bg-')) || 'bg-gray-500/10';
      const textColor = categoryColor.split(' ').find(c => c.includes('text-')) || 'text-gray-400';
      
      // Calculate label position
      let labelTop = Math.max(topPercent - 3, 2);
      let labelTransform = "translateY(-100%)";
      let labelPositionClass = "top-full";
      
      if (topPercent < 10) {
        labelTop = topPercent + 1;
        labelTransform = "translateY(0)";
        labelPositionClass = "top-0";
      }
      
      // Prepare label text
      let labelText = detection.label;
      
      return (
        <div 
          key={index} 
          className="absolute pointer-events-none"
          style={{
            left: `${leftPercent}%`,
            top: `${topPercent}%`,
            width: `${widthPercent}%`,
            height: `${heightPercent}%`,
          }}
        >
          {/* Bounding Box with animated border */}
          <div
            className={`absolute inset-0 border-2 ${borderColor} ${bgColor} animate-pulse rounded-sm`}
            style={{
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
          
          {/* Corner markers */}
          <div className={`absolute -top-1 -left-1 w-3 h-3 ${borderColor} border-t-2 border-l-2`} />
          <div className={`absolute -top-1 -right-1 w-3 h-3 ${borderColor} border-t-2 border-r-2`} />
          <div className={`absolute -bottom-1 -left-1 w-3 h-3 ${borderColor} border-b-2 border-l-2`} />
          <div className={`absolute -bottom-1 -right-1 w-3 h-3 ${borderColor} border-b-2 border-r-2`} />
          
          {/* Label */}
          <div
            className={`absolute left-0 ${labelPositionClass} z-20 min-w-[160px]`}
            style={{
              top: `${labelTop}%`,
              transform: labelTransform,
            }}
          >
            <div className="bg-gray-900/95 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg border border-gray-700 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${borderColor.replace('border-', 'bg-')}`} />
                  <span className="font-bold">{labelText}</span>
                  <span className="ml-2 text-xs text-gray-400">#{index + 1}</span>
                </div>
              </div>
              
              {/* Size information for microplastics */}
              {detection.label.toLowerCase() === 'microplastic' && detection.diagonal_µm && (
                <div className="mt-1 text-[10px] text-gray-300">
                  <div className="flex justify-between">
                    <span>Size:</span>
                    <span className="font-semibold">{detection.diagonal_µm.toFixed(1)} µm</span>
                  </div>
                  {detection.width_µm && detection.height_µm && (
                    <div className="flex justify-between">
                      <span>Dim:</span>
                      <span>{detection.width_µm.toFixed(1)} × {detection.height_µm.toFixed(1)} µm</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Arrow pointer */}
            <div className="absolute left-4 -bottom-1 w-2 h-2 bg-gray-900/95 transform rotate-45 border-b border-r border-gray-700" />
          </div>
        </div>
      );
    });
  };

  // Calculate paginated history
  const totalPages = Math.ceil(history.length / itemsPerPage);
  const startIndex = currentHistoryPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedHistory = history.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
      <header className="p-4 border-b border-gray-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Microplastic Screening Tool
            </h1>
            <p className="text-gray-400 text-sm">AI-powered size classification system</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${showHistory ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 hover:bg-gray-700"}`}
            >
              <History size={18} />
              <span>History </span>
            </button>
            <div className={`px-3 py-1 rounded-full text-sm ${mode === "camera" ? "bg-blue-500/20 text-blue-400" : "bg-gray-800 text-gray-400"}`}>
              Camera
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${mode === "gallery" ? "bg-purple-500/20 text-purple-400" : "bg-gray-800 text-gray-400"}`}>
              Gallery
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {showHistory ? (
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center">
                <History className="mr-2 text-blue-400" size={24} />
                Analysis History
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={clearAllHistory}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                >
                  <Trash2 size={18} />
                  <span>Clear All</span>
                </button>
                <button
                  onClick={() => setShowHistory(false)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                >
                  <X size={18} />
                  <span>Back to Camera</span>
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <History size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">No history yet</p>
                <p className="text-sm mt-2">Perform some detections to build history</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {paginatedHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-blue-500/50 cursor-pointer transition-all hover:scale-[1.02] group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-medium">{item.filename}</h3>
                          <p className="text-sm text-gray-400 flex items-center">
                            <Calendar size={12} className="mr-1" />
                            {item.timestamp}
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="p-2 rounded-full bg-gray-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-lg font-bold text-blue-400">
                          {item.result.count} particles
                        </div>
                        <div className="flex space-x-2">
                          {item.result.size_counts && (
                            <>
                              <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                                N: {item.result.size_counts.nanoplastic}
                              </span>
                              <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
                                S: {item.result.size_counts.small}
                              </span>
                              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                                M: {item.result.size_counts.medium}
                              </span>
                              <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                                L: {item.result.size_counts.large}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="relative h-32 overflow-hidden rounded-lg bg-black">
                        <img
                          src={item.imageData}
                          alt="History thumbnail"
                          className="w-full h-full object-cover opacity-80"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-800">
                    <button
                      onClick={() => setCurrentHistoryPage(Math.max(0, currentHistoryPage - 1))}
                      disabled={currentHistoryPage === 0}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={18} />
                      <span>Previous</span>
                    </button>
                    <div className="text-sm text-gray-400">
                      Page {currentHistoryPage + 1} of {totalPages}
                    </div>
                    <button
                      onClick={() => setCurrentHistoryPage(Math.min(totalPages - 1, currentHistoryPage + 1))}
                      disabled={currentHistoryPage >= totalPages - 1}
                      className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span>Next</span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Camera/Image Preview Section */}
            <div className="relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
              <div className="relative aspect-square overflow-hidden">
                {mode === "camera" && !image ? (
                  <>
                    <Webcam
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                      videoConstraints={{
                        facingMode: "environment",
                        aspectRatio: 1
                      }}
                      mirrored={false}
                    />
                    <div className="absolute inset-0 border-4 border-blue-500/30 rounded-2xl pointer-events-none" />
                  </>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    {image && (
                      <>
                        <img
                          ref={imageRef}
                          src={image}
                          alt="Captured"
                          className="max-w-full max-h-full object-contain"
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            setImageDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight
                            });
                          }}
                        />
                        {renderBoundingBoxes()}
                      </>
                    )}
                  </div>
                )}

                {loading && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4" />
                    <p className="text-lg">Analyzing sample...</p>
                    <p className="text-gray-400 text-sm mt-2">Classifying microplastic sizes</p>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="p-6 bg-gradient-to-t from-black/80 to-transparent">
                {mode === "camera" && !image ? (
                  <div className="flex justify-center items-center space-x-6">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                    >
                      <Upload size={24} className="mb-2" />
                      <span className="text-sm">Upload</span>
                    </button>
                    
                    <button
                      onClick={capture}
                      className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 transition-colors flex items-center justify-center shadow-lg shadow-blue-500/30"
                    >
                      <Camera className="text-black" size={32} />
                    </button>

                    <button
                      onClick={() => {
                        const stream = webcamRef.current?.video?.srcObject as MediaStream;
                        if (stream) {
                          const tracks = stream.getVideoTracks();
                          tracks.forEach(track => {
                            track.stop();
                          });
                        }
                      }}
                      className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
                    >
                      <RotateCw size={24} className="mb-2" />
                      <span className="text-sm">Flip</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="flex space-x-3">
                      <button
                        onClick={reset}
                        className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center space-x-2"
                      >
                        <Camera size={20} />
                        <span>New Scan</span>
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors flex items-center space-x-2"
                      >
                        <Upload size={20} />
                        <span>Upload New</span>
                      </button>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={saveCurrentResult}
                        className="p-3 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
                        title="Save to History"
                      >
                        <Save size={20} />
                      </button>
                      <button
                        onClick={reset}
                        className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Results Panel */}
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold flex items-center">
                    <AlertCircle className="mr-2 text-yellow-500" size={24} />
                    Detection Results
                  </h2>
                  {result && (
                    <div className="flex space-x-2">
                      <button
                        onClick={downloadResults}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
                      >
                        <Download size={18} />
                        <span>Download</span>
                      </button>
                      <button
                        onClick={downloadReportPDF}
                        className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
                      >
                        <FileText size={18} />
                        <span>Report</span>
                      </button>
                    </div>
                  )}
                </div>
                
                {result ? (
                  <div className="space-y-6">
                    {/* Size Distribution Summary */}
                    {result.size_counts && (
                      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                        <h3 className="font-medium text-gray-300 mb-3 flex items-center">
                          <Droplets className="mr-2 text-blue-400" size={18} />
                          Size Distribution
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className={`p-3 rounded-lg ${sizeCategoryColors.nanoplastic.split(' ').join(' ')}`}>
                            <div className="text-xs">Nanoplastic</div>
                            <div className="text-2xl font-bold">{result.size_counts.nanoplastic}</div>
                            <div className="text-[10px] opacity-75">&lt; 1 µm</div>
                          </div>
                          <div className={`p-3 rounded-lg ${sizeCategoryColors.small.split(' ').join(' ')}`}>
                            <div className="text-xs">Small</div>
                            <div className="text-2xl font-bold">{result.size_counts.small}</div>
                            <div className="text-[10px] opacity-75">1-100 µm</div>
                          </div>
                          <div className={`p-3 rounded-lg ${sizeCategoryColors.medium.split(' ').join(' ')}`}>
                            <div className="text-xs">Medium</div>
                            <div className="text-2xl font-bold">{result.size_counts.medium}</div>
                            <div className="text-[10px] opacity-75">100-1000 µm</div>
                          </div>
                          <div className={`p-3 rounded-lg ${sizeCategoryColors.large.split(' ').join(' ')}`}>
                            <div className="text-xs">Large</div>
                            <div className="text-2xl font-bold">{result.size_counts.large}</div>
                            <div className="text-[10px] opacity-75">1-5 mm</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Total Counts */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-500/10 p-4 rounded-xl">
                        <p className="text-sm text-gray-400">Total Detected</p>
                        <p className="text-3xl font-bold text-blue-400">{result.count}</p>
                      </div>
                      <div className="bg-purple-500/10 p-4 rounded-xl">
                        <p className="text-sm text-gray-400">Avg. Confidence</p>
                        <p className="text-3xl font-bold text-purple-400">
                          {result.detections.length > 0 
                            ? `${((result.detections.reduce((acc, d) => acc + (Number(d.confidence) || 0), 0) / result.detections.length) * 100).toFixed(1)}%`
                            : "0%"
                          }
                        </p>
                      </div>
                    </div>

                    {/* Detection Details */}
                    <div className="space-y-3">
                      <h3 className="font-medium text-gray-300 flex items-center">
                        <Ruler className="mr-2 text-green-400" size={18} />
                        Detection Details
                      </h3>
                      <div className="max-h-96 overflow-y-auto pr-2">
                        {result.detections.map((detection, index) => {
                          const confidence = Number(detection.confidence) || 0;
                          const confidencePercent = (confidence * 100).toFixed(1);
                          const categoryColor = getSizeCategoryColor(detection);
                          
                          return (
                            <div
                              key={index}
                              className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 mb-3"
                            >
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center">
                                  <div className={`w-3 h-3 rounded-full mr-2 ${categoryColor.split(' ').find(c => c.includes('border-'))?.replace('border-', 'bg-')}`} />
                                  <span className="font-medium">{detection.label}</span>
                                  {detection.size_category && (
                                    <span className="ml-2 text-xs px-2 py-1 rounded-full bg-gray-700/50">
                                      {detection.size_category}
                                    </span>
                                  )}
                                </div>
                                <span className="font-semibold">
                                  {confidencePercent}%
                                </span>
                              </div>
                              
                              {/* Size information for microplastics */}
                              {detection.label.toLowerCase() === 'microplastic' && detection.diagonal_µm && (
                                <div className="mb-3 p-2 bg-gray-900/50 rounded text-xs">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <div className="text-gray-400">Size:</div>
                                      <div className="font-semibold">{detection.diagonal_µm.toFixed(1)} µm</div>
                                    </div>
                                    <div>
                                      <div className="text-gray-400">Dimensions:</div>
                                      <div className="font-semibold">{detection.width_µm?.toFixed(1)} × {detection.height_µm?.toFixed(1)} µm</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Bounding box info */}
                              <div className="text-sm text-gray-400 mt-2">
                                <div className="flex justify-between items-center">
                                  <span>Position:</span>
                                  <span className="font-mono text-xs">
                                    [{detection.bbox.map(n => Number(n).toFixed(0)).join(", ")}]
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p>Processing image...</p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle size={48} className="mx-auto mb-4 text-gray-600" />
                    <p>Capture or upload an image to detect microplastics</p>
                    <p className="text-sm mt-2">Includes automatic size classification</p>
                  </div>
                )}
              </div>

              {/* Calibration Info */}
              {result?.calibration_info && (
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <AlertCircle className="mr-2 text-blue-500" size={20} />
                    Calibration Info
                  </h3>
                  <div className="text-sm text-gray-400 space-y-2">
                    <div className="flex justify-between">
                      <span>Resolution:</span>
                      <span>{result.calibration_info.microns_per_pixel.toFixed(2)} µm/px</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Field of View:</span>
                      <span>{result.calibration_info.field_of_view_µm[0].toFixed(0)} × {result.calibration_info.field_of_view_µm[1].toFixed(0)} µm</span>
                    </div>
                    <div className="pt-2 border-t border-gray-800 text-xs italic">
                      Note: Calibrate using a reference slide for accurate size measurements
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}