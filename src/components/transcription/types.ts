
export type ExportFormat = 'vtt' | 'srt' | 'text' | 'json';

export interface TranscriptionCardProps {
  modelName?: string;
  vttContent?: string;
  prompt?: string;
  onSelect?: () => void;
  isSelected?: boolean;
  audioSrc?: string | null;
  isLoading?: boolean;
  className?: string;
  showPagination?: boolean;
  showExportOptions?: boolean;
  showAudioControls?: boolean;
  onExport?: () => void;
  onAccept?: () => void;
}
