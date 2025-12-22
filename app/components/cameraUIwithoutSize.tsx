    "use client";

    import Webcam from "react-webcam";
    import { useRef, useState, useEffect } from "react";
    import axios from "axios";
    import { Camera, Upload, X, RotateCw, AlertCircle, CheckCircle } from "lucide-react";

    interface Detection {
    confidence: number;
    bbox: number[] | [number, number, number, number];
    label: string;
    }

    interface DetectionResult {
    count: number;
    detections: Detection[];
    image_size?: [number, number];
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

    const calculateBoundingBox = (bbox: number[], imgWidth: number, imgHeight: number) => {
        const [x, y, width, height] = parseBbox(bbox);
        
        // Check if coordinates are normalized (0-1) or absolute pixels
        const isNormalized = x <= 1 && y <= 1 && width <= 1 && height <= 1;
        
        if (isNormalized) {
        // Convert normalized coordinates to percentages
        return {
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: `${width * 100}%`,
            height: `${height * 100}%`,
        };
        } else {
        // Convert pixel coordinates to percentages
        return {
            left: `${(x / imgWidth) * 100}%`,
            top: `${(y / imgHeight) * 100}%`,
            width: `${(width / imgWidth) * 100}%`,
            height: `${(height / imgHeight) * 100}%`,
        };
        }
    };

    const capture = async () => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (!imageSrc) return;

        setImage(imageSrc);
        setMode("gallery");
        await sendToBackend(base64ToBlob(imageSrc));
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

    const sendToBackend = async (file: Blob) => {
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
                label: d.label || "Microplastic"
                }))
            : [],
        };
        
        setResult(processedResult);
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
        
        // Determine color based on confidence
        let borderColor, bgColor, textColor;
        if (confidence > 0.7) {
            borderColor = "border-green-500";
            bgColor = "bg-green-500/10";
            textColor = "text-green-400";
        } else if (confidence > 0.4) {
            borderColor = "border-yellow-500";
            bgColor = "bg-yellow-500/10";
            textColor = "text-yellow-400";
        } else {
            borderColor = "border-red-500";
            bgColor = "bg-red-500/10";
            textColor = "text-red-400";
        }
        
        // Calculate label position - try to place it above the box, but adjust if near top edge
        let labelTop = Math.max(topPercent - 3, 2); // Position 3% above box, minimum 2% from top
        let labelTransform = "translateY(-100%)";
        let labelPositionClass = "top-full"; // Default: label below when placed above
        
        // If box is too close to top, place label inside at the top
        if (topPercent < 10) {
            labelTop = topPercent + 1; // Place inside box at the top
            labelTransform = "translateY(0)";
            labelPositionClass = "top-0";
        }
        
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
            
            {/* Corner markers for better visibility */}
            <div className={`absolute -top-1 -left-1 w-3 h-3 ${borderColor} border-t-2 border-l-2`} />
            <div className={`absolute -top-1 -right-1 w-3 h-3 ${borderColor} border-t-2 border-r-2`} />
            <div className={`absolute -bottom-1 -left-1 w-3 h-3 ${borderColor} border-b-2 border-l-2`} />
            <div className={`absolute -bottom-1 -right-1 w-3 h-3 ${borderColor} border-b-2 border-r-2`} />
            
            {/* Label positioned intelligently */}
            <div
                className={`absolute left-0 ${labelPositionClass} z-20 min-w-[120px] `}
                style={{
                top: `${labelTop}%`,
                transform: labelTransform,
                }}
            >
                <div className="bg-gray-900/95 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg border border-gray-700 shadow-xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${borderColor.replace('border-', 'bg-')}`} />
                    <span className="font-bold">{detection.label}</span>
                    <span className="ml-2 text-xs text-gray-400">#{index + 1}</span>
                    </div>
                </div>
                
                {/* Bounding box coordinates info (smaller) */}
                <div className="mt-1 font-semibold text-[10px]">
                    {confidencePercent}%
                 {/*   Size: {boxWidth.toFixed(0)}×{boxHeight.toFixed(0)}*/}
                </div>
                </div>
                
                {/* Arrow pointer connecting label to box */}
                <div className="absolute left-4 -bottom-1 w-2 h-2 bg-gray-900/95 transform rotate-45 border-b border-r border-gray-700" />
            </div>
            </div>
        );
        });
    };

    const formatBboxDisplay = (bbox: number[]): string => {
        const parsed = parseBbox(bbox);
        return parsed.map(n => Number(n).toFixed(1)).join(", ");
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
        <header className="p-4 border-b border-gray-800">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Microplastic Screening Tool
                </h1>
                <p className="text-gray-400 text-sm">AI-powered screening system</p>
            </div>
            <div className="flex items-center space-x-2">
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
                    <p className="text-gray-400 text-sm mt-2">Detecting microplastics</p>
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
                    <button
                        onClick={reset}
                        className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors"
                    >
                        <X size={20} />
                    </button>
                    </div>
                )}
                </div>
            </div>

            {/* Results Panel */}
            <div className="space-y-6">
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <AlertCircle className="mr-2 text-yellow-500" size={24} />
                    Detection Results
                </h2>
                
                {result ? (
                    <div className="space-y-4">
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

                    <div className="space-y-3">
                        <h3 className="font-medium text-gray-300">Detection Details</h3>
                        {result.detections.map((detection, index) => {
                        const confidence = Number(detection.confidence) || 0;
                        const confidencePercent = (confidence * 100).toFixed(1);
                        
                        return (
                            <div
                            key={index}
                            className="bg-gray-800/50 p-4 rounded-lg border border-gray-700"
                            >
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-2 ${
                                    confidence > 0.7 ? 'bg-green-500' : 
                                    confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                                }`} />
                                <span className="font-medium">{detection.label}</span>
                                <span className="ml-2 text-xs text-gray-400">#{index + 1}</span>
                                </div>
                                <span className={`font-semibold ${
                                confidence > 0.7 ? 'text-green-400' : 
                                confidence > 0.4 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                {confidencePercent}%
                                </span>
                            </div>
                            <div className="text-sm text-gray-400 mt-2">
                                <div className="flex justify-between items-center">
                           <span>Bounding Box:</span>
                                <span className="font-mono text-xs">
                                    [{formatBboxDisplay(detection.bbox)}]
                                </span>
                                </div>
                            </div>
                            </div>
                        );
                        })}
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
                    <p className="text-sm mt-2">Supported formats: JPEG, PNG</p>
                    </div>
                )}
                </div>

                {/* Instructions Panel */}
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-3 flex items-center">
                    <AlertCircle className="mr-2 text-blue-500" size={20} />
                    Instructions
                </h3>
                <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 mr-3" />
                    Ensure good lighting for better detection accuracy
                    </li>
                    <li className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 mr-3" />
                    Focus on a single sample area at a time
                    </li>
                    <li className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 mr-3" />
                    Keep the camera steady while capturing
                    </li>
                    <li className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 mr-3" />
                    Results include bounding boxes and confidence scores
                    </li>
                </ul>
                </div>
            </div>
            </div>
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
        
        {/* Add custom animation for pulsing border */}
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