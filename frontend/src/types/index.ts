export interface FileInfo {
  file_id: string;
  filename: string;
  path: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface Message {
  text: string;
  isUser: boolean;
  tokenUsage?: TokenUsage;
  images?: string[];
  files?: FileInfo[];
  runSteps?: RunStep[];
  isFunctionCall?: boolean;
  isDxaResponse?: boolean;
}

export interface RunStepToolCall {
  type: string;
  code_interpreter?: {
    input: string;
    outputs: Array<{
      type: string;
      logs?: string;
      image?: {
        file_id: string;
      };
    }>;
  };
}

export interface RunStep {
  type: string;
  step_details: {
    tool_calls?: RunStepToolCall[];
  };
}

export type ImageDetailLevel = 'low' | 'high' | 'auto'; 