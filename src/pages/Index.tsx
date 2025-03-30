
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Check, Loader2, Upload, FileAudio, Cog, Send, Info, FileText, PlayCircle, PauseCircle, Bell, BellOff } from "lucide-react";

import FileUpload from "@/components/FileUpload";
import ModelSelector, { TranscriptionModel } from "@/components/ModelSelector";
import TranscriptionCard from "@/components/TranscriptionCard";
import LogsPanel from "@/components/LogsPanel";
import VideoIdInput from "@/components/VideoIdInput";
import PromptOptions from "@/components/PromptOptions";
import SharePointDownloader from "@/components/SharePointDownloader";
import FileQueue from "@/components/FileQueue";
import { useLogsStore } from "@/lib/useLogsStore";
import { 
  transcribeAudio, 
  fetchBrightcoveKeys,
  getBrightcoveAuthToken,
  addCaptionToBrightcove,
  saveTranscriptionState,
  getTranscriptionState,
  clearTranscriptionState,
  updateTranscriptionResult
} from "@/lib/api";
import { DEFAULT_TRANSCRIPTION_PROMPT } from "@/lib/phi4TranscriptionService";
import { requestNotificationPermission, showNotification } from "@/lib/notifications";

const Index = () => {
  // Main state
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<TranscriptionModel[]>(["openai", "gemini", "phi4"]);
  const [videoId, setVideoId] = useState<string>("");
  const [selectedTranscription, setSelectedTranscription] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [transcriptionPrompt, setTranscriptionPrompt] = useState<string>(DEFAULT_TRANSCRIPTION_PROMPT);
  
  // SharePoint and Queue state
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
  
  // Prompt options state
  const [preserveEnglish, setPreserveEnglish] = useState<boolean>(true);
  const [outputFormat, setOutputFormat] = useState<"vtt" | "plain">("vtt");
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Processing state
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [transcriptions, setTranscriptions] = useState<Record<string, { vtt: string, prompt: string, loading: boolean }>>({
    openai: { vtt: "", prompt: "", loading: false },
    gemini: { vtt: "", prompt: "", loading: false },
    phi4: { vtt: "", prompt: "", loading: false }
  });
  
  // Recovery state
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState<boolean>(false);
  const [recoveryState, setRecoveryState] = useState<any>(null);
  
  // Logs and notification
  const { logs, addLog, startTimedLog } = useLogsStore();
  const { toast } = useToast();

  // Check for in-progress transcription on mount
  useEffect(() => {
    const savedState = getTranscriptionState();
    if (savedState) {
      console.log('Found saved transcription state:', savedState);
      setRecoveryState(savedState);
      setShowRecoveryPrompt(true);
    }
  }, []);
  
  // Handle recovery confirmation
  const handleRecoverTranscription = async () => {
    if (!recoveryState) return;
    
    try {
      addLog(`Recovering transcription session from ${new Date(recoveryState.timestamp).toLocaleString()}`, "info", {
        source: "Recovery",
        details: `File: ${recoveryState.fileName}, Models: ${recoveryState.selectedModels.join(', ')}`
      });
      
      // Set all the state from the recovered data
      setSelectedModels(recoveryState.selectedModels);
      setTranscriptionPrompt(recoveryState.prompt);
      setTranscriptions(recoveryState.results);
      
      // Check if all transcriptions are complete
      const allComplete = Object.values(recoveryState.results).every((result: any) => !result.loading);
      
      if (!allComplete) {
        // Re-process any incomplete transcriptions
        toast({
          title: "Transcription Recovery",
          description: "Continuing previously started transcription process...",
        });
      } else {
        toast({
          title: "Transcription Recovered",
          description: "Previously completed transcription has been restored.",
        });
      }
      
      setShowRecoveryPrompt(false);
    } catch (error) {
      console.error('Error recovering transcription:', error);
      toast({
        title: "Recovery Failed",
        description: "Could not recover the previous transcription.",
        variant: "destructive",
      });
      clearTranscriptionState();
      setShowRecoveryPrompt(false);
    }
  };
  
  // Discard saved transcription
  const handleDiscardTranscription = () => {
    clearTranscriptionState();
    setShowRecoveryPrompt(false);
    setRecoveryState(null);
    
    addLog("Previous transcription session discarded", "info", {
      source: "Recovery"
    });
    
    toast({
      title: "Transcription Discarded",
      description: "Previous transcription has been cleared.",
    });
  };

  // Request notification permission when notifications are enabled
  useEffect(() => {
    if (notificationsEnabled) {
      requestNotificationPermission().then(granted => {
        if (!granted) {
          toast({
            title: "Notification Permission Denied",
            description: "Please enable notifications in your browser settings to receive alerts.",
            variant: "destructive",
          });
          setNotificationsEnabled(false);
        }
      });
    }
  }, [notificationsEnabled, toast]);
  
  // Update prompt based on options
  const updatePromptFromOptions = () => {
    let newPrompt = "";
    
    if (preserveEnglish) {
      newPrompt += "Please preserve all English words exactly as spoken. ";
    }
    
    if (outputFormat === "vtt") {
      newPrompt += "Generate output with timestamps in VTT format. ";
    } else {
      newPrompt += "Generate plain text without timestamps. ";
    }
    
    setTranscriptionPrompt(newPrompt.trim());
  };
  
  // Handle playback of audio file
  const toggleAudioPlayback = () => {
    if (!audioRef.current) return;
    
    if (isAudioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    
    setIsAudioPlaying(!isAudioPlaying);
  };
  
  // Handle SharePoint files being queued
  const handleFilesQueued = (files: File[]) => {
    setFileQueue(files);
    setCurrentQueueIndex(0);
    addLog(`Queued ${files.length} files from SharePoint`, "info", {
      details: `Files: ${files.map(f => f.name).join(", ")}`,
      source: "SharePoint"
    });
    
    if (notificationsEnabled) {
      showNotification("Files Queued", {
        body: `${files.length} audio files are ready for sequential processing`,
        tag: "file-queue"
      });
    }
  };
  
  // Process the next file in the queue
  const processNextInQueue = async () => {
    if (currentQueueIndex >= fileQueue.length) {
      return;
    }
    
    const nextFile = fileQueue[currentQueueIndex];
    await handleFileUpload(nextFile);
    setCurrentQueueIndex(prev => prev + 1);
  };
  
  // Skip the current file in the queue
  const skipCurrentInQueue = () => {
    addLog(`Skipped file: ${fileQueue[currentQueueIndex]?.name}`, "info", {
      source: "FileQueue"
    });
    setCurrentQueueIndex(prev => prev + 1);
  };
  
  // Reset the queue
  const resetQueue = () => {
    setFileQueue([]);
    setCurrentQueueIndex(0);
    setFile(null);
    setAudioUrl(null);
    setSelectedTranscription(null);
    setSelectedModel(null);
    
    addLog("File queue reset", "info", {
      source: "FileQueue"
    });
  };
  
  // When a file is uploaded
  const handleFileUpload = async (uploadedFile: File) => {
    try {
      setFile(uploadedFile);
      const newAudioUrl = URL.createObjectURL(uploadedFile);
      setAudioUrl(newAudioUrl);
      setSelectedTranscription(null);
      setSelectedModel(null);
      
      setTranscriptions({
        openai: { vtt: "", prompt: "", loading: false },
        gemini: { vtt: "", prompt: "", loading: false },
        phi4: { vtt: "", prompt: "", loading: false }
      });
      
      addLog(`File selected: ${uploadedFile.name}`, "info", {
        details: `Size: ${Math.round(uploadedFile.size / 1024)} KB | Type: ${uploadedFile.type}`,
        source: "FileUpload"
      });
      
      toast({
        title: "File Selected",
        description: "Your audio file is ready for transcription.",
      });
      
      if (notificationsEnabled) {
        showNotification("File Selected", {
          body: "Your audio file is ready for transcription.",
          tag: "file-upload"
        });
      }
    } catch (error) {
      console.error("Error handling file:", error);
      addLog(`Error handling file`, "error", {
        details: error instanceof Error ? error.message : String(error),
        source: "FileUpload"
      });
      
      toast({
        title: "File Error",
        description: "There was a problem with your file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Update options and regenerate prompt
  const handlePreserveEnglishChange = (checked: boolean) => {
    setPreserveEnglish(checked);
    setTimeout(updatePromptFromOptions, 0);
  };
  
  const handleOutputFormatChange = (format: "vtt" | "plain") => {
    setOutputFormat(format);
    setTimeout(updatePromptFromOptions, 0);
  };
  
  const handleNotificationsChange = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      
      if (granted) {
        toast({
          title: "Notifications Enabled",
          description: "You will receive browser notifications when processes complete.",
        });
      }
    } else {
      setNotificationsEnabled(false);
      toast({
        title: "Notifications Disabled",
        description: "You will no longer receive browser notifications.",
      });
    }
  };
  
  // Process transcriptions with selected models
  const processTranscriptions = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please upload an audio file first.",
        variant: "destructive",
      });
      return;
    }
    
    if (!Array.isArray(selectedModels) || selectedModels.length === 0) {
      toast({
        title: "No Models Selected",
        description: "Please select at least one transcription model.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      const mainLog = startTimedLog("Transcription Process", "info", "Transcription");
      
      updatePromptFromOptions();
      
      // Save transcription state to localStorage for persistence
      saveTranscriptionState(file, selectedModels, transcriptionPrompt);
      
      const updatedTranscriptions = { ...transcriptions };
      selectedModels.forEach(model => {
        updatedTranscriptions[model] = { vtt: "", prompt: transcriptionPrompt, loading: true };
      });
      setTranscriptions(updatedTranscriptions);
      
      addLog(`Processing transcriptions with models: ${selectedModels.join(", ")}`, "info", {
        details: `File: ${file.name} | Size: ${Math.round(file.size / 1024)} KB | Prompt: "${transcriptionPrompt}"`,
        source: "Transcription"
      });
      
      const transcriptionPromises = selectedModels.map(async (model) => {
        const modelLog = startTimedLog(`${model.toUpperCase()} Transcription`, "info", model.toUpperCase());
        
        try {
          modelLog.update(`Sending audio to ${model} with prompt: "${transcriptionPrompt}"`);
          const result = await transcribeAudio(file, model, transcriptionPrompt);
          
          if (model === 'gemini') {
            addLog(`Gemini transcription result received`, "debug", {
              source: "gemini",
              details: `VTT Content length: ${result.vttContent.length}, First 100 chars: ${result.vttContent.substring(0, 100)}...`
            });
          }
          
          const wordCount = result.vttContent.split(/\s+/).length;
          modelLog.complete(
            `${model.toUpperCase()} transcription successful`, 
            `Generated ${wordCount} words | VTT format | Length: ${result.vttContent.length} characters`
          );
          
          return { model, vtt: result.vttContent, prompt: result.prompt || transcriptionPrompt };
        } catch (error) {
          modelLog.error(
            `${model.toUpperCase()} transcription failed`,
            error instanceof Error ? error.message : String(error)
          );
          throw error;
        }
      });
      
      const results = await Promise.allSettled(transcriptionPromises);
      
      const finalTranscriptions = { ...transcriptions };
      
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const { model, vtt, prompt } = result.value;
          
          if (model === 'gemini') {
            addLog(`Updating Gemini transcription in state`, "debug", {
              source: "gemini",
              details: `VTT length: ${vtt.length}, First 100 chars: ${vtt.substring(0, 100)}...`
            });
          }
          
          finalTranscriptions[model] = { vtt, prompt, loading: false };
        } else {
          const failedModelIndex = results.findIndex(r => r === result);
          if (failedModelIndex >= 0 && failedModelIndex < selectedModels.length) {
            const model = selectedModels[failedModelIndex];
            finalTranscriptions[model] = { vtt: "", prompt: transcriptionPrompt, loading: false };
          }
        }
      });
      
      addLog(`Updating transcriptions state with results`, "debug", {
        source: "Transcription",
        details: `Models processed: ${selectedModels.join(', ')}`
      });
      
      setTranscriptions(finalTranscriptions);
      
      if (selectedModels.includes('gemini')) {
        addLog(`Gemini state after update: ${finalTranscriptions.gemini?.vtt ? 'Has content' : 'No content'}`, "debug", {
          source: "gemini",
          details: `VTT length: ${finalTranscriptions.gemini?.vtt?.length || 0}`
        });
      }
      
      const successfulTranscriptions = results.filter(r => r.status === "fulfilled").length;
      
      if (successfulTranscriptions > 0) {
        mainLog.complete(
          `Transcription process completed`, 
          `${successfulTranscriptions} out of ${selectedModels.length} transcriptions successful`
        );
        
        toast({
          title: "Transcription Complete",
          description: `${successfulTranscriptions} out of ${selectedModels.length} transcriptions completed successfully.`,
        });
        
        if (notificationsEnabled) {
          showNotification("Transcription Complete", {
            body: `${successfulTranscriptions} out of ${selectedModels.length} transcriptions completed successfully.`,
            tag: "transcription-complete"
          });
        }
        
        // Clear persistence state after successful completion
        if (successfulTranscriptions === selectedModels.length) {
          clearTranscriptionState();
        }
      } else {
        mainLog.error(
          `Transcription process failed`,
          `All ${selectedModels.length} transcription attempts failed`
        );
        
        toast({
          title: "Transcription Failed",
          description: "All transcription attempts failed. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error processing transcriptions:", error);
      addLog(`Error in transcription process`, "error", {
        details: error instanceof Error ? error.message : String(error),
        source: "Transcription"
      });
      
      toast({
        title: "Processing Error",
        description: "There was a problem processing your transcriptions.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // When a transcription is selected
  const handleSelectTranscription = (model: string, vtt: string) => {
    setSelectedTranscription(vtt);
    setSelectedModel(model);
    addLog(`Selected ${model.toUpperCase()} transcription for publishing`, "info", {
      source: "Selection",
      details: `VTT length: ${vtt.length} characters | Word count: ${vtt.split(/\s+/).length} words`
    });
  };
  
  // Publish caption to Brightcove
  const publishCaption = async () => {
    if (!selectedTranscription || !videoId) {
      toast({
        title: "Missing Information",
        description: "Please select a transcription and enter a video ID.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsPublishing(true);
      const publishLog = startTimedLog("Caption Publishing", "info", "Brightcove");
      
      publishLog.update(`Preparing caption for video ID: ${videoId}`);
      
      const credentialsLog = startTimedLog("Brightcove Authentication", "info", "Brightcove API");
      
      let brightcoveKeys;
      try {
        brightcoveKeys = await fetchBrightcoveKeys();
        credentialsLog.update("Retrieving Brightcove auth token...");
        
        const authToken = await getBrightcoveAuthToken(
          brightcoveKeys.brightcove_client_id,
          brightcoveKeys.brightcove_client_secret
        );
        
        credentialsLog.complete("Brightcove authentication successful", 
          `Account ID: ${brightcoveKeys.brightcove_account_id} | Token obtained`);
        
        publishLog.update(`Adding caption to Brightcove video ID: ${videoId}`);
        
        await addCaptionToBrightcove(
          videoId,
          selectedTranscription,
          'ar',
          'Arabic',
          brightcoveKeys.brightcove_account_id,
          authToken
        );
        
        publishLog.complete(
          "Caption published successfully", 
          `Video ID: ${videoId} | Language: Arabic`
        );
        
        toast({
          title: "Caption Published",
          description: "Your caption has been successfully published to the Brightcove video.",
        });
      } catch (error) {
        credentialsLog.error("Brightcove authentication failed", error instanceof Error ? error.message : String(error));
        publishLog.error("Caption publishing failed", error instanceof Error ? error.message : String(error));
        throw error;
      }
    } catch (error) {
      console.error("Error publishing caption:", error);
      addLog(`Error publishing caption`, "error", {
        details: error instanceof Error ? error.message : String(error),
        source: "Brightcove"
      });
      
      toast({
        title: "Publishing Failed",
        description: "There was a problem publishing your caption.",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-[1440px] mx-auto p-4 md:p-6">
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Transcription Pipeline
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
            Download MP3 files from SharePoint, transcribe with multiple AI models, and publish captions to Brightcove.
          </p>
        </header>
        
        {showRecoveryPrompt && recoveryState && (
          <Card className="mb-6 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">
                    Continue Previous Transcription?
                  </h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                    A transcription was in progress when you last used this app ({new Date(recoveryState.timestamp).toLocaleTimeString()} on {new Date(recoveryState.timestamp).toLocaleDateString()}).
                    Would you like to continue from where you left off?
                  </p>
                </div>
                <div className="flex gap-2 self-end md:self-auto">
                  <Button 
                    variant="outline" 
                    className="border-yellow-600 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/40"
                    onClick={handleDiscardTranscription}
                  >
                    Discard
                  </Button>
                  <Button 
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={handleRecoverTranscription}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <Card className="overflow-hidden border-l-4 border-l-blue-500 shadow-sm">
              <CardContent className="pt-4 p-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center">
                  <FileAudio className="mr-1 h-4 w-4 text-blue-500" />
                  Upload Audio
                </h3>
                <FileUpload onFileUpload={handleFileUpload} isUploading={isUploading} />
                
                {file && (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <div className="text-xs flex items-center justify-between">
                      <div className="truncate mr-2">
                        <Check className="h-3 w-3 text-green-500 mr-1 inline-block" />
                        <span className="font-medium">File:</span> 
                        <span className="ml-1 truncate">{file.name}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({Math.round(file.size / 1024)} KB)
                        </span>
                      </div>
                      
                      {audioUrl && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center gap-1 h-6 text-xs"
                          onClick={toggleAudioPlayback}
                        >
                          {isAudioPlaying ? <PauseCircle className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                    
                    {audioUrl && (
                      <audio 
                        ref={audioRef} 
                        src={audioUrl} 
                        onEnded={() => setIsAudioPlaying(false)}
                        onPause={() => setIsAudioPlaying(false)}
                        onPlay={() => setIsAudioPlaying(true)}
                        className="hidden"
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="overflow-hidden border-l-4 border-l-green-500 shadow-sm">
              <CardContent className="pt-4 p-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center">
                  <Cog className="mr-1 h-4 w-4 text-green-500" />
                  Transcription Settings
                </h3>
                
                <div className="space-y-2">
                  <ModelSelector 
                    selectedModels={selectedModels} 
                    onModelChange={setSelectedModels}
                    disabled={isProcessing || !file}
                  />
                  
                  <Button 
                    onClick={processTranscriptions} 
                    disabled={isProcessing || !file || selectedModels.length === 0}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 h-8 text-xs"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-1 h-3 w-3" />
                        Generate Transcriptions
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card className={`overflow-hidden border-l-4 ${selectedTranscription ? 'border-l-amber-500' : 'border-l-gray-300'} shadow-sm transition-colors duration-300 ${!selectedTranscription ? 'opacity-60' : ''}`}>
              <CardContent className="pt-4 p-3">
                <h3 className={`text-sm font-semibold mb-2 flex items-center ${!selectedTranscription ? 'text-muted-foreground' : ''}`}>
                  <Send className={`mr-1 h-4 w-4 ${selectedTranscription ? 'text-amber-500' : 'text-gray-400'}`} />
                  Publish Options {!selectedTranscription && '(Select a transcription first)'}
                </h3>
                
                <div className="space-y-2">
                  <VideoIdInput 
                    videoId={videoId} 
                    onChange={setVideoId}
                    disabled={isPublishing || !selectedTranscription}
                  />
                  
                  <Button 
                    onClick={publishCaption} 
                    disabled={isPublishing || !selectedTranscription || !videoId}
                    className={`w-full ${selectedTranscription 
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' 
                      : 'bg-gray-400'} h-8 text-xs`}
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Send className="mr-1 h-3 w-3" />
                        Publish Caption
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <details className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
              <summary className="cursor-pointer font-medium flex items-center text-sm">
                <Cog className="h-4 w-4 mr-2" />
                Advanced Settings
              </summary>
              <div className="pt-3 space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="prompt" className="text-xs font-medium">
                      Transcription Prompt Options:
                    </label>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Info className="h-3 w-3 mr-1" />
                      <span>Not all models support prompts</span>
                    </div>
                  </div>
                  
                  <PromptOptions 
                    preserveEnglish={preserveEnglish}
                    onPreserveEnglishChange={handlePreserveEnglishChange}
                    outputFormat={outputFormat}
                    onOutputFormatChange={handleOutputFormatChange}
                    notificationsEnabled={notificationsEnabled}
                    onNotificationsChange={handleNotificationsChange}
                    disabled={isProcessing}
                  />
                  
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-medium">Generated Prompt:</p>
                    <p className="text-xs text-muted-foreground mt-1">{transcriptionPrompt || "No prompt generated yet"}</p>
                  </div>
                </div>
              </div>
            </details>
            
            <details className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
              <summary className="cursor-pointer font-medium flex items-center text-sm">
                <Upload className="h-4 w-4 mr-2" />
                SharePoint Files & Queue
              </summary>
              <div className="pt-3 space-y-3">
                <SharePointDownloader 
                  onFilesQueued={handleFilesQueued}
                  isProcessing={isProcessing}
                />
                
                {fileQueue.length > 0 && (
                  <FileQueue
                    files={fileQueue}
                    currentIndex={currentQueueIndex}
                    onProcessNext={processNextInQueue}
                    onSkip={skipCurrentInQueue}
                    onReset={resetQueue}
                    isProcessing={isProcessing}
                    notificationsEnabled={notificationsEnabled}
                  />
                )}
              </div>
            </details>
          </div>
          
          <div className="lg:col-span-9 space-y-4">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold flex items-center">
                <Check className="mr-2 h-5 w-5 text-violet-500" />
                Transcription Results
              </h2>
              
              {selectedModels.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {selectedModels.map((model) => (
                    <TranscriptionCard
                      key={model}
                      modelName={
                        model === "openai" 
                          ? "OpenAI Whisper" 
                          : model === "gemini" 
                            ? "Google Gemini" 
                            : "Microsoft Phi-4"
                      }
                      vttContent={transcriptions[model].vtt}
                      prompt={transcriptions[model].prompt}
                      onSelect={() => handleSelectTranscription(model, transcriptions[model].vtt)}
                      isSelected={selectedModel === model}
                      audioSrc={audioUrl || undefined}
                      isLoading={transcriptions[model].loading}
                    />
                  ))}
                </div>
              ) : (
                <Card className="p-8 flex flex-col items-center justify-center text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Transcriptions Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Upload an audio file and select at least one transcription model to see results here.
                  </p>
                </Card>
              )}
            </div>
            
            <details className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
              <summary className="cursor-pointer font-medium flex items-center text-sm">
                <FileText className="h-4 w-4 mr-2 text-gray-500" />
                System Logs
              </summary>
              <div className="h-[400px] mt-3">
                <LogsPanel logs={logs} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
