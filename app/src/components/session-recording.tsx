"use client";

import { useState } from "react";

interface SessionRecordingProps {
  sessionId: string;
}

export function SessionRecording({ sessionId }: SessionRecordingProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {!isLoaded && !hasError && (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="w-10 h-10 rounded-lg bg-[#E8FF00]/10 flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 text-[#E8FF00]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-xs text-[#555] font-mono tracking-wide">Loading recording...</p>
        </div>
      )}
      {hasError && (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="w-10 h-10 rounded-lg bg-[#EF4444]/10 flex items-center justify-center text-[#EF4444]">
            &#x2717;
          </div>
          <p className="text-xs text-[#EF4444]">Failed to load recording</p>
        </div>
      )}
      <iframe
        src={`/api/recordings/player?sessionId=${sessionId}`}
        className={`w-full bg-[#0a0a0a] rounded-lg ${isLoaded && !hasError ? "" : "h-0 overflow-hidden"}`}
        style={isLoaded && !hasError ? { aspectRatio: "16/10", border: "none", overflow: "hidden" } : { border: "none" }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
      />
    </div>
  );
}
