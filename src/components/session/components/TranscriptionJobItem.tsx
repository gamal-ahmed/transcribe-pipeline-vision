
import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Star, StarIcon, RefreshCw } from "lucide-react";
import { 
  getStatusIcon, 
  getStatusColor, 
  getProgressValue, 
  getModelDisplayName,
  formatJobDate
} from "../utils/transcriptionJobUtils";
import { TranscriptionJob } from "../types/transcription";

interface TranscriptionJobItemProps {
  job: TranscriptionJob;
  isSelected: boolean;
  isAccepted: boolean;
  isComparisonSelected: boolean;
  isPolling: boolean;
  onSelectJob: (job: TranscriptionJob) => void;
  onMarkAsAccepted?: (job: TranscriptionJob) => void;
  onRetryJob?: (job: TranscriptionJob) => void;
}

const TranscriptionJobItem: React.FC<TranscriptionJobItemProps> = ({
  job,
  isSelected,
  isAccepted,
  isComparisonSelected,
  isPolling,
  onSelectJob,
  onMarkAsAccepted,
  onRetryJob
}) => {
  const { relative: relativeDateFormatted, formatted: formattedDate } = formatJobDate(job.created_at);
  
  return (
    <div
      className={cn(
        "border rounded-md p-3 cursor-pointer transition-all",
        job.status === 'completed' ? 'hover:border-primary/50 hover:bg-muted/50' : '',
        isComparisonSelected ? 'border-primary bg-primary/5' : '',
        isAccepted ? 'border-green-500 border-2 bg-green-500/10 shadow-md' : '',
        isSelected && !isAccepted ? 'border-primary border-2 bg-primary/10 shadow-md' : '',
        (job.status === 'processing' || job.status === 'pending') && isPolling ? 'border-blue-300 dark:border-blue-700 animate-pulse' : '',
        job.status === 'failed' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : ''
      )}
      onClick={() => onSelectJob(job)}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-1.5">
          <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'outline'}>
            {getStatusIcon(job.status)}
            <span className="ml-1 capitalize">{job.status}</span>
          </Badge>
          
          {isAccepted && (
            <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
              <Star className="h-3 w-3 mr-1 fill-green-500 text-green-500" />
              Accepted
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {relativeDateFormatted}
        </span>
      </div>
      
      <div className="mb-2">
        <h4 className="font-medium">{getModelDisplayName(job.model)}</h4>
      </div>
      
      <div className="mt-2">
        <Progress 
          value={getProgressValue(job.status)} 
          className={cn(
            "h-1 mb-1",
            (job.status === 'processing' || job.status === 'pending') && isPolling ? 'animate-pulse' : '',
            job.status === 'failed' ? 'bg-red-100 dark:bg-red-900/20' : ''
          )} 
        />
        <div className="flex justify-between text-xs">
          <span className={getStatusColor(job.status)}>
            {job.status === 'failed' ? 'Failed' : job.status === 'completed' ? 'Complete' : 'Processing...'}
          </span>
          <span className="text-muted-foreground">{formattedDate}</span>
        </div>
      </div>
      
      {job.status === 'failed' && job.error && (
        <div className="mt-2 mb-2">
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded truncate" title={job.error}>
            {job.error.length > 60 ? `${job.error.substring(0, 60)}...` : job.error}
          </p>
        </div>
      )}
      
      <div className="mt-3 flex justify-end gap-2">
        {job.status === 'failed' && onRetryJob && (
          <Button 
            size="sm" 
            variant="outline"
            className="text-xs border-red-200 hover:border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            onClick={(e) => {
              e.stopPropagation();
              onRetryJob(job);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
        )}
        
        {job.status === 'completed' && onMarkAsAccepted && (
          <Button 
            size="sm" 
            variant={isAccepted ? "default" : "outline"}
            className={cn(
              "text-xs",
              isAccepted 
                ? "bg-green-600 text-white hover:bg-green-700 border-green-600" 
                : "border-green-600/30 text-green-600 hover:bg-green-600/10"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsAccepted(job);
            }}
          >
            {isAccepted ? (
              <>
                <StarIcon className="h-3.5 w-3.5 mr-1 fill-current" />
                Accepted
              </>
            ) : (
              <>
                <Star className="h-3.5 w-3.5 mr-1" />
                Accept
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default TranscriptionJobItem;
