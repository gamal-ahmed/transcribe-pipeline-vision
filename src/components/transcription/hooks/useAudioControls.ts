
import { RefObject } from 'react';
import { parseTimeToSeconds } from '../utils/timeUtils';
import { VTTSegment } from '../types';

interface UseAudioControlsProps {
  audioRef: RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  duration: number;
  volume: number;
  isMuted: boolean;
  vttSegments: VTTSegment[];
  setVolume: (volume: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  setCurrentTime: (time: number) => void;
  addLog: (message: string, level: string, options?: any) => void;
}

export const useAudioControls = ({
  audioRef,
  isPlaying,
  duration,
  volume,
  isMuted,
  vttSegments,
  setVolume,
  setIsMuted,
  setCurrentTime,
  addLog
}: UseAudioControlsProps) => {

  // Helper function to validate and safely parse time values
  const safeParseTimeToSeconds = (timeString: string): number | null => {
    try {
      // First check if the timeString is in valid format
      if (!timeString.match(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)) {
        addLog(`Invalid time format: ${timeString}`, "warning", {
          source: "TranscriptionCard"
        });
        return null;
      }
      
      const seconds = parseTimeToSeconds(timeString);
      
      // Validate that the result is a finite number
      if (!Number.isFinite(seconds) || seconds < 0) {
        addLog(`Invalid time value after parsing: ${timeString} -> ${seconds}`, "warning", {
          source: "TranscriptionCard"
        });
        return null;
      }
      
      return seconds;
    } catch (error: any) {
      addLog(`Error parsing time: ${timeString} - ${error.message}`, "error", {
        source: "TranscriptionCard",
        details: error.stack
      });
      return null;
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
        addLog(`Error playing audio: ${err.message}`, "error", {
          source: "TranscriptionCard",
          details: err.stack
        });
      });
    }
  };
  
  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    
    const newTime = value[0];
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };
  
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };
  
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (isMuted && volume === 0) {
      setVolume(0.5);
    }
  };
  
  const jumpForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
  };
  
  const jumpBackward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
  };
  
  const jumpToSegment = (index: number) => {
    if (!audioRef.current || !vttSegments[index]) return;
    
    try {
      const startTime = safeParseTimeToSeconds(vttSegments[index].startTime);
      
      // If we couldn't parse the time properly, don't try to set it
      if (startTime === null) {
        addLog(`Could not jump to segment ${index + 1} due to invalid timestamp: ${vttSegments[index].startTime}`, "warning", {
          source: "TranscriptionCard"
        });
        return;
      }
      
      audioRef.current.currentTime = startTime;
      
      if (!isPlaying) {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
          addLog(`Error playing audio after segment click: ${error.message}`, "error", {
            source: "TranscriptionCard"
          });
        });
      }
    } catch (error: any) {
      console.error('Error jumping to segment:', error);
      addLog(`Error jumping to segment: ${error.message}`, "error", {
        source: "TranscriptionCard",
        details: error.stack
      });
    }
  };

  const playSegment = (index: number) => {
    if (!audioRef.current || !vttSegments[index]) return;
    
    try {
      const startTime = safeParseTimeToSeconds(vttSegments[index].startTime);
      const endTime = safeParseTimeToSeconds(vttSegments[index].endTime);
      
      // If either time is invalid, don't proceed
      if (startTime === null || endTime === null) {
        addLog(`Could not play segment ${index + 1} due to invalid timestamps: start=${vttSegments[index].startTime}, end=${vttSegments[index].endTime}`, "warning", {
          source: "TranscriptionCard"
        });
        return;
      }
      
      audioRef.current.currentTime = startTime;
      
      audioRef.current.play().catch(error => {
        console.error('Error playing audio segment:', error);
        addLog(`Error playing audio segment: ${error.message}`, "error", {
          source: "TranscriptionCard"
        });
      });
      
      const duration = endTime - startTime;
      setTimeout(() => {
        if (audioRef.current && audioRef.current.currentTime >= endTime) {
          audioRef.current.pause();
        }
      }, duration * 1000);
      
      addLog(`Playing segment ${index + 1}`, "debug", {
        source: "TranscriptionCard",
        details: `Start: ${vttSegments[index].startTime}, End: ${vttSegments[index].endTime}`
      });
    } catch (error: any) {
      console.error('Error playing segment:', error);
      addLog(`Error playing segment: ${error.message}`, "error", {
        source: "TranscriptionCard",
        details: error.stack
      });
    }
  };

  return {
    togglePlay,
    handleSeek,
    handleVolumeChange,
    toggleMute,
    jumpForward,
    jumpBackward,
    jumpToSegment,
    playSegment
  };
};
