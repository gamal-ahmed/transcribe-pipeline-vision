
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface UrlAudioProcessorProps {
  onAudioProcessed: (file: File) => void;
  isProcessing?: boolean;
}

const UrlAudioProcessor: React.FC<UrlAudioProcessorProps> = ({ 
  onAudioProcessed,
  isProcessing = false 
}) => {
  const [url, setUrl] = useState('');
  const [fetchingAudio, setFetchingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectUrlType = (url: string): string | null => {
    if (!url) return null;
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    } else if (url.includes('dropbox.com')) {
      return 'dropbox';
    } else if (url.includes('drive.google.com')) {
      return 'google-drive';
    } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
      return 'facebook';
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      return 'twitter';
    } else if (url.includes('.mp3') || url.includes('.wav') || url.includes('.ogg') || url.includes('.m4a')) {
      return 'direct-audio';
    }
    
    return null;
  };

  const processUrl = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    const urlType = detectUrlType(url);
    if (!urlType) {
      setError('Unsupported URL type. Please use YouTube, Dropbox, Google Drive, Facebook, Twitter, or a direct audio URL');
      return;
    }

    setFetchingAudio(true);
    setError(null);

    try {
      // Call our edge function to process the URL
      const { data, error: functionError } = await supabase.functions.invoke('url-audio-processor', {
        body: { url, sourceType: urlType }
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to process URL');
      }

      if (!data || !data.audioUrl) {
        throw new Error('No audio data received');
      }

      // Download the processed audio file
      const response = await fetch(data.audioUrl);
      const blob = await response.blob();
      
      // Create a file object from the blob
      const filename = data.filename || `audio-${Date.now()}.mp3`;
      const file = new File([blob], filename, { type: 'audio/mpeg' });
      
      // Pass the file to the parent component
      onAudioProcessed(file);
      
      toast.success('Audio extracted successfully!');
      setUrl('');

    } catch (error) {
      console.error('Error processing URL:', error);
      setError((error as Error).message || 'Failed to process URL');
      toast.error('Error processing audio from URL', {
        description: (error as Error).message || 'Please try another URL or upload directly'
      });
    } finally {
      setFetchingAudio(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Paste YouTube, Dropbox, Drive, Facebook, or Twitter/X URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={fetchingAudio || isProcessing}
              className="flex-grow"
            />
            <Button 
              onClick={processUrl} 
              disabled={fetchingAudio || isProcessing || !url.trim()}
              className="shrink-0"
            >
              {fetchingAudio ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Extract Audio
                </>
              )}
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="mt-4 text-xs text-muted-foreground">
            <p>Supported platforms: YouTube, Dropbox, Google Drive, Facebook, Twitter/X, and direct audio URLs</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UrlAudioProcessor;
