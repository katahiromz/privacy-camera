/// <reference types="react" />
/// <reference types="react-dom" />

// NodeJS types for browser environment
declare namespace NodeJS {
  type Timeout = number;
}

// Android WebView interface
interface AndroidInterface {
  onStartShutterSound: () => void;
  onEndShutterSound: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  openAppSettings?: () => void;
  openURL?: (url: string) => void;
  finishApp?: () => void;
  saveMediaToGallery: (base64data: string, fileName: string, mimeType: string, type: string) => void;
}

// Extend Window interface
interface Window {
  android?: AndroidInterface;
}

// Legacy getUserMedia types
interface Navigator {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: Error) => void
  ) => void;
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: Error) => void
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: Error) => void
  ) => void;
  msGetUserMedia?: (
    constraints: MediaStreamConstraints,
    successCallback: (stream: MediaStream) => void,
    errorCallback: (error: Error) => void
  ) => void;
}
